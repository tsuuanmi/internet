import { randomBytes } from "node:crypto";
import { normalizeGitHubRepository } from "#internet/workflow/approval-policy";
import { createWorkflowControlMessage } from "#internet/workflow/control";
import { parseWorkflowReviewResult } from "#internet/workflow/review-result";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import { TERMINAL_WORKFLOW_STATES, } from "#internet/workflow/types";
export class WorkflowEngineError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowEngineError";
    }
}
function jobId() {
    return randomBytes(16).toString("hex");
}
function now() {
    return new Date().toISOString();
}
function laneSession(ownerSessionId, job, phase, lane) {
    return `${ownerSessionId}:workflow:${job}:${phase}:${lane}`;
}
function writerSession(ownerSessionId, job) {
    return `${ownerSessionId}:workflow:${job}:writer`;
}
function withState(current, state) {
    return { ...current, revision: current.revision + 1, state, updatedAt: now() };
}
function replaceLane(runs, lane, mutate) {
    return runs.map((run) => (run.lane === lane ? mutate(run) : run));
}
function allCompleted(runs) {
    return runs.every((run) => run.status === "completed");
}
function receipt(handoff) {
    return {
        handoffId: handoff.handoffId,
        source: handoff.source,
        recipient: handoff.recipient,
        sequence: handoff.sequence,
        payloadHash: handoff.payloadHash,
        status: handoff.status,
    };
}
function upsertReceipts(current, incoming) {
    const byId = new Map(current.map((item) => [item.handoffId, item]));
    for (const item of incoming)
        byId.set(item.handoffId, item);
    return [...byId.values()].sort((a, b) => a.sequence - b.sequence || a.handoffId.localeCompare(b.handoffId));
}
function researchReceipts(job) {
    return job.handoffReceipts.filter((item) => item.recipient === job.accountRouting.writerAccount && /^research:[AB]$/u.test(item.source));
}
function reviewReceipts(job) {
    const prefix = `review:${job.reviewCycle}:`;
    return job.handoffReceipts.filter((item) => item.recipient === job.accountRouting.writerAccount && item.source.startsWith(prefix));
}
function samePullRequestIdentity(a, b) {
    const repository = normalizeGitHubRepository(a.repository);
    return (repository !== undefined &&
        repository === normalizeGitHubRepository(b.repository) &&
        a.number === b.number &&
        a.url === b.url &&
        a.base === b.base &&
        a.head === b.head);
}
export class WorkflowEngine {
    constructor(jobs, teams, prompts = new WorkflowTeamPromptBuilder(), handoffs, writer, maxReviewCycles = 3, events) {
        this.jobs = jobs;
        this.teams = teams;
        this.prompts = prompts;
        this.handoffs = handoffs;
        this.writer = writer;
        if (!Number.isSafeInteger(maxReviewCycles) || maxReviewCycles < 1)
            throw new WorkflowEngineError("max review cycles must be a positive integer");
        this.maxReviewCycles = maxReviewCycles;
        this.events = events;
    }
    start(input) {
        const objective = input.objective.trim();
        if (objective === "")
            throw new WorkflowEngineError("workflow objective is required");
        if (input.repository.trim() === "")
            throw new WorkflowEngineError("workflow repository is required");
        if (!/^[0-9a-f]{40}$/u.test(input.baseRevision))
            throw new WorkflowEngineError("workflow base revision must be a full Git SHA");
        if (input.ownerSessionId.trim() === "")
            throw new WorkflowEngineError("workflow owner session id is required");
        const id = jobId();
        const timestamp = now();
        return this.jobs.create({
            schema: "@tsuuanmi/internet-workflow-job",
            version: 1,
            revision: 1,
            jobId: id,
            ownerSessionId: input.ownerSessionId,
            objective,
            repository: input.repository,
            baseRevision: input.baseRevision,
            state: "CREATED",
            teamRuns: {
                research: [
                    {
                        lane: "A",
                        status: "pending",
                        attempts: 0,
                        sessionId: laneSession(input.ownerSessionId, id, "research", "A"),
                    },
                    {
                        lane: "B",
                        status: "pending",
                        attempts: 0,
                        sessionId: laneSession(input.ownerSessionId, id, "research", "B"),
                    },
                ],
                review: [
                    {
                        lane: "A",
                        status: "pending",
                        attempts: 0,
                        sessionId: laneSession(input.ownerSessionId, id, "review", "A"),
                    },
                    {
                        lane: "B",
                        status: "pending",
                        attempts: 0,
                        sessionId: laneSession(input.ownerSessionId, id, "review", "B"),
                    },
                ],
            },
            accountRouting: {
                thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
                writerAccount: "chatgpt-writer",
                synthesizerAccount: "chatgpt-thinker",
            },
            handoffReceipts: [],
            writerConversation: { sessionId: writerSession(input.ownerSessionId, id), accountId: "chatgpt-writer" },
            reviewCycle: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
        });
    }
    status(jobId) {
        const job = this.jobs.get(jobId);
        if (job === undefined)
            throw new WorkflowEngineError(`workflow job ${jobId} does not exist`);
        return job;
    }
    async runResearch(jobId, signal) {
        if (this.teams === undefined)
            throw new WorkflowEngineError("workflow team runner is not configured");
        const before = this.status(jobId);
        if (!["CREATED", "RESEARCH_RUNNING", "FAILED_RETRYABLE"].includes(before.state)) {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot run research from ${before.state}`);
        }
        const lanes = before.teamRuns.research.filter((run) => run.status !== "completed").map((run) => run.lane);
        if (lanes.length === 0) {
            if (before.state === "RESEARCH_HANDOFFS_DELIVERING")
                return before;
            return this.update(jobId, (current) => withState(current, "RESEARCH_HANDOFFS_DELIVERING"));
        }
        const running = this.update(jobId, (current) => {
            let research = current.teamRuns.research;
            for (const lane of lanes) {
                research = replaceLane(research, lane, (run) => ({
                    ...run,
                    status: "running",
                    attempts: run.attempts + 1,
                    error: undefined,
                }));
            }
            return {
                ...withState(current, "RESEARCH_RUNNING"),
                teamRuns: { ...current.teamRuns, research },
                lastEvent: { type: "RESEARCH_STARTED", class: "INTERNAL", at: now() },
            };
        });
        await Promise.all(lanes.map(async (lane) => {
            const run = running.teamRuns.research.find((item) => item.lane === lane);
            if (run === undefined)
                throw new WorkflowEngineError(`missing research lane ${lane}`);
            let result;
            try {
                result = await this.teams.run({
                    task: this.prompts.research(running, lane),
                    sessionId: run.sessionId,
                    accounts: running.accountRouting.thinkerAccounts,
                    synthesizer: running.accountRouting.synthesizerAccount,
                    signal,
                });
            }
            catch (error) {
                result = {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                    failedAccountId: running.accountRouting.synthesizerAccount,
                    failedProvider: "chatgpt-web",
                };
            }
            this.recordTeamResult(jobId, "research", lane, result);
        }));
        return this.update(jobId, (current) => {
            const completed = allCompleted(current.teamRuns.research);
            return {
                ...withState(current, completed ? "RESEARCH_HANDOFFS_DELIVERING" : "FAILED_RETRYABLE"),
                lastEvent: {
                    type: completed ? "RESEARCH_COMPLETED" : "RESEARCH_RETRY_REQUIRED",
                    class: completed ? "INTERNAL" : "ACTION_REQUIRED",
                    at: now(),
                    ...(completed
                        ? {}
                        : { message: "One or more research lanes failed; retry runs only incomplete lanes." }),
                },
            };
        });
    }
    prepareResearchHandoffs(jobId) {
        if (this.handoffs === undefined)
            throw new WorkflowEngineError("workflow handoff store is not configured");
        const job = this.status(jobId);
        if (job.state !== "RESEARCH_HANDOFFS_DELIVERING" && job.state !== "WRITER_RUNNING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot prepare research handoffs from ${job.state}`);
        }
        if (!allCompleted(job.teamRuns.research))
            throw new WorkflowEngineError("all research lanes must complete before handoff creation");
        const handoffs = job.teamRuns.research.map((run, index) => {
            if (run.result === undefined)
                throw new WorkflowEngineError(`research lane ${run.lane} has no final result`);
            return this.handoffs.create({
                jobId,
                source: `research:${run.lane}`,
                recipient: job.accountRouting.writerAccount,
                sequence: index + 1,
                payload: run.result.finalAnswer,
            });
        });
        this.update(jobId, (current) => ({
            ...current,
            revision: current.revision + 1,
            handoffReceipts: upsertReceipts(current.handoffReceipts, handoffs.map(receipt)),
            lastEvent: { type: "RESEARCH_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },
            updatedAt: now(),
        }));
        return handoffs;
    }
    markHandoffDelivered(jobId, handoffId, expectedPayloadHash) {
        if (this.handoffs === undefined)
            throw new WorkflowEngineError("workflow handoff store is not configured");
        const delivered = this.handoffs.markDelivered(jobId, handoffId, expectedPayloadHash);
        return this.update(jobId, (current) => {
            if (!current.handoffReceipts.some((item) => item.handoffId === handoffId)) {
                throw new WorkflowEngineError(`handoff ${handoffId} is not registered on workflow job ${jobId}`);
            }
            return {
                ...current,
                revision: current.revision + 1,
                handoffReceipts: upsertReceipts(current.handoffReceipts, [receipt(delivered)]),
                lastEvent: { type: "HANDOFF_DELIVERED", class: "INTERNAL", at: now() },
                updatedAt: now(),
            };
        });
    }
    startImplementationControl(jobId) {
        const current = this.status(jobId);
        if (current.state !== "RESEARCH_HANDOFFS_DELIVERING" && current.state !== "WRITER_RUNNING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot start implementation from ${current.state}`);
        }
        const receipts = researchReceipts(current);
        if (receipts.length !== 2 || !receipts.every((item) => item.status === "delivered")) {
            throw new WorkflowEngineError("writer cannot start until both research handoffs are delivered");
        }
        const job = current.state === "WRITER_RUNNING"
            ? current
            : this.update(jobId, (state) => ({
                ...withState(state, "WRITER_RUNNING"),
                lastEvent: { type: "START_IMPLEMENTATION_READY", class: "INTERNAL", at: now() },
            }));
        return { job, control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId) };
    }
    /** Deliver exact research payloads to the persistent writer conversation, then execute START_IMPLEMENTATION. */
    async runWriterImplementation(jobId, signal) {
        if (this.writer === undefined)
            throw new WorkflowEngineError("workflow writer runner is not configured");
        if (this.handoffs === undefined)
            throw new WorkflowEngineError("workflow handoff store is not configured");
        let job = this.status(jobId);
        if (job.state !== "RESEARCH_HANDOFFS_DELIVERING" && job.state !== "WRITER_RUNNING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot run writer implementation from ${job.state}`);
        }
        const handoffs = this.prepareResearchHandoffs(jobId)
            .slice()
            .sort((a, b) => a.sequence - b.sequence);
        job = this.status(jobId);
        for (const handoff of handoffs) {
            const currentReceipt = job.handoffReceipts.find((item) => item.handoffId === handoff.handoffId);
            if (currentReceipt?.status === "delivered")
                continue;
            await this.writer.deliverExact({
                sessionId: job.writerConversation.sessionId,
                payload: handoff.payload,
                signal,
            });
            job = this.markHandoffDelivered(jobId, handoff.handoffId, handoff.payloadHash);
        }
        const step = this.startImplementationControl(jobId);
        const result = await this.writer.runControl({
            sessionId: step.job.writerConversation.sessionId,
            job: step.job,
            control: step.control,
            signal,
        });
        if (result.status === "UNKNOWN_CONFIRMATION") {
            return this.update(jobId, (current) => ({
                ...withState(current, "UNKNOWN_CONFIRMATION"),
                pendingAction: {
                    kind: "UNKNOWN_CONFIRMATION",
                    message: result.message,
                    resumeState: "WRITER_RUNNING",
                },
                lastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        if (result.status === "BLOCKED") {
            return this.update(jobId, (current) => ({
                ...withState(current, "BLOCKED"),
                pendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_RUNNING" },
                lastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        if (result.status !== "PR_OPEN")
            throw new WorkflowEngineError("writer returned merge output outside merge phase");
        return this.update(jobId, (current) => ({
            ...withState(current, "PR_OPEN"),
            pullRequest: result.pullRequest,
            pendingAction: undefined,
            lastEvent: { type: "PR_OPENED", class: "PROGRESS", at: now(), message: result.pullRequest.url },
        }));
    }
    /** Run the two independent reviewer lanes against the exact persisted PR head. */
    async runReview(jobId, signal) {
        if (this.teams === undefined)
            throw new WorkflowEngineError("workflow team runner is not configured");
        const before = this.status(jobId);
        if (before.pullRequest === undefined)
            throw new WorkflowEngineError("workflow review requires a persisted pull request");
        if (before.state !== "PR_OPEN" && before.state !== "REVIEW_RUNNING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot run review from ${before.state}`);
        }
        const startingCycle = before.state === "PR_OPEN";
        const cycle = startingCycle ? before.reviewCycle + 1 : before.reviewCycle;
        if (cycle > this.maxReviewCycles)
            return this.reviewLimitReached(jobId, before.pullRequest.headSha);
        const lanes = before.teamRuns.review.filter((run) => run.status !== "completed").map((run) => run.lane);
        if (lanes.length === 0) {
            return this.update(jobId, (current) => withState(current, "REVIEW_HANDOFFS_DELIVERING"));
        }
        const running = this.update(jobId, (current) => {
            let review = current.teamRuns.review;
            for (const lane of lanes) {
                review = replaceLane(review, lane, (run) => ({
                    ...run,
                    status: "running",
                    attempts: run.attempts + 1,
                    error: undefined,
                    result: undefined,
                }));
            }
            return {
                ...withState(current, "REVIEW_RUNNING"),
                reviewCycle: cycle,
                teamRuns: { ...current.teamRuns, review },
                lastEvent: { type: "REVIEW_CYCLE_STARTED", class: "PROGRESS", at: now(), message: `cycle ${cycle}` },
            };
        });
        const reviewedHeadSha = running.pullRequest?.headSha;
        if (reviewedHeadSha === undefined)
            throw new WorkflowEngineError("workflow review lost its PR receipt");
        await Promise.all(lanes.map(async (lane) => {
            const run = running.teamRuns.review.find((item) => item.lane === lane);
            if (run === undefined)
                throw new WorkflowEngineError(`missing review lane ${lane}`);
            let result;
            let reviewResult;
            try {
                result = await this.teams.run({
                    task: this.prompts.review(running, lane),
                    sessionId: run.sessionId,
                    accounts: running.accountRouting.thinkerAccounts,
                    synthesizer: running.accountRouting.synthesizerAccount,
                    signal,
                });
                if (result.ok) {
                    reviewResult = parseWorkflowReviewResult(result.finalAnswer);
                    if (reviewResult.reviewedHeadSha !== reviewedHeadSha) {
                        throw new Error("workflow reviewer result is bound to a different PR head SHA");
                    }
                }
            }
            catch (error) {
                result = {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                    failedAccountId: running.accountRouting.synthesizerAccount,
                    failedProvider: "chatgpt-web",
                };
            }
            this.recordTeamResult(jobId, "review", lane, result, reviewResult);
        }));
        return this.update(jobId, (current) => {
            const completed = allCompleted(current.teamRuns.review) &&
                current.teamRuns.review.every((run) => run.result?.reviewedHeadSha === current.pullRequest?.headSha);
            return {
                ...withState(current, completed ? "REVIEW_HANDOFFS_DELIVERING" : "REVIEW_RUNNING"),
                lastEvent: {
                    type: completed ? "REVIEW_COMPLETED" : "REVIEW_RETRY_REQUIRED",
                    class: completed ? "INTERNAL" : "ACTION_REQUIRED",
                    at: now(),
                    ...(completed ? {} : { message: "One or more review lanes failed; rerun only incomplete lanes." }),
                },
            };
        });
    }
    prepareReviewHandoffs(jobId) {
        if (this.handoffs === undefined)
            throw new WorkflowEngineError("workflow handoff store is not configured");
        const job = this.status(jobId);
        if (job.pullRequest === undefined)
            throw new WorkflowEngineError("review handoffs require a persisted pull request");
        if (job.state !== "REVIEW_HANDOFFS_DELIVERING" && job.state !== "WRITER_REMEDIATING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot prepare review handoffs from ${job.state}`);
        }
        if (!allCompleted(job.teamRuns.review))
            throw new WorkflowEngineError("all review lanes must complete before handoff creation");
        const handoffs = job.teamRuns.review.map((run, index) => {
            if (run.result === undefined ||
                run.result.reviewedHeadSha !== job.pullRequest?.headSha ||
                run.result.reviewVerdict === undefined) {
                throw new WorkflowEngineError(`review lane ${run.lane} is not bound to the current PR head`);
            }
            return this.handoffs.create({
                jobId,
                source: `review:${job.reviewCycle}:${run.lane}`,
                recipient: job.accountRouting.writerAccount,
                sequence: job.reviewCycle * 2 + index + 1,
                payload: run.result.finalAnswer,
            });
        });
        this.update(jobId, (current) => ({
            ...current,
            revision: current.revision + 1,
            handoffReceipts: upsertReceipts(current.handoffReceipts, handoffs.map(receipt)),
            lastEvent: { type: "REVIEW_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },
            updatedAt: now(),
        }));
        return handoffs;
    }
    startApplyReviewsControl(jobId) {
        const current = this.status(jobId);
        if (current.state !== "REVIEW_HANDOFFS_DELIVERING" && current.state !== "WRITER_REMEDIATING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot apply reviews from ${current.state}`);
        }
        const receipts = reviewReceipts(current);
        if (receipts.length !== 2 || !receipts.every((item) => item.status === "delivered")) {
            throw new WorkflowEngineError("writer cannot apply reviews until both review handoffs are delivered");
        }
        const job = current.state === "WRITER_REMEDIATING"
            ? current
            : this.update(jobId, (state) => ({
                ...withState(state, "WRITER_REMEDIATING"),
                lastEvent: {
                    type: "REMEDIATION_STARTED",
                    class: "PROGRESS",
                    at: now(),
                    message: state.pullRequest?.url,
                },
            }));
        return { job, control: createWorkflowControlMessage("APPLY_REVIEWS", jobId, job.pullRequest?.headSha) };
    }
    /** Deliver reviewer finals verbatim, then either pass the review gate or remediate the same PR. */
    async runWriterRemediation(jobId, signal) {
        if (this.writer === undefined)
            throw new WorkflowEngineError("workflow writer runner is not configured");
        if (this.handoffs === undefined)
            throw new WorkflowEngineError("workflow handoff store is not configured");
        let job = this.status(jobId);
        if (job.state !== "REVIEW_HANDOFFS_DELIVERING" && job.state !== "WRITER_REMEDIATING") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot run remediation from ${job.state}`);
        }
        if (job.pullRequest === undefined)
            throw new WorkflowEngineError("writer remediation requires a persisted pull request");
        const reviewedPullRequest = job.pullRequest;
        const handoffs = this.prepareReviewHandoffs(jobId)
            .slice()
            .sort((a, b) => a.sequence - b.sequence);
        job = this.status(jobId);
        for (const handoff of handoffs) {
            const currentReceipt = job.handoffReceipts.find((item) => item.handoffId === handoff.handoffId);
            if (currentReceipt?.status === "delivered")
                continue;
            await this.writer.deliverExact({
                sessionId: job.writerConversation.sessionId,
                payload: handoff.payload,
                signal,
            });
            job = this.markHandoffDelivered(jobId, handoff.handoffId, handoff.payloadHash);
        }
        const verdicts = job.teamRuns.review.map((run) => run.result?.reviewVerdict);
        if (verdicts.every((verdict) => verdict === "PASS")) {
            return this.update(jobId, (current) => ({
                ...withState(current, "READY_FOR_MERGE_AUTHORIZATION"),
                pendingAction: undefined,
                lastEvent: { type: "REVIEW_GATE_PASSED", class: "PROGRESS", at: now(), message: current.pullRequest?.url },
            }));
        }
        if (job.reviewCycle >= this.maxReviewCycles)
            return this.reviewLimitReached(jobId, reviewedPullRequest.headSha);
        const step = this.startApplyReviewsControl(jobId);
        const result = await this.writer.runControl({
            sessionId: step.job.writerConversation.sessionId,
            job: step.job,
            control: step.control,
            signal,
        });
        if (result.status === "UNKNOWN_CONFIRMATION") {
            return this.update(jobId, (current) => ({
                ...withState(current, "UNKNOWN_CONFIRMATION"),
                pendingAction: { kind: "UNKNOWN_CONFIRMATION", message: result.message, resumeState: "WRITER_REMEDIATING" },
                lastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        if (result.status === "BLOCKED") {
            return this.update(jobId, (current) => ({
                ...withState(current, "BLOCKED"),
                pendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_REMEDIATING" },
                lastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        if (result.status !== "PR_OPEN")
            throw new WorkflowEngineError("writer returned merge output outside merge phase");
        if (!samePullRequestIdentity(reviewedPullRequest, result.pullRequest)) {
            return this.writerBlocked(jobId, "writer remediation changed the authoritative pull-request identity", "WRITER_REMEDIATING");
        }
        if (result.pullRequest.headSha === reviewedPullRequest.headSha) {
            return this.writerBlocked(jobId, "writer remediation did not advance the pull-request head SHA", "WRITER_REMEDIATING");
        }
        return this.update(jobId, (current) => ({
            ...withState(current, "PR_OPEN"),
            pullRequest: result.pullRequest,
            teamRuns: {
                ...current.teamRuns,
                review: current.teamRuns.review.map((run) => ({
                    ...run,
                    status: "pending",
                    result: undefined,
                    error: undefined,
                })),
            },
            pendingAction: undefined,
            lastEvent: { type: "REMEDIATION_COMPLETED", class: "PROGRESS", at: now(), message: result.pullRequest.url },
        }));
    }
    /** Move a fully reviewed PR into the explicit user-authorization gate. */
    requestMergeAuthorization(jobId) {
        const current = this.status(jobId);
        if (current.state !== "READY_FOR_MERGE_AUTHORIZATION") {
            throw new WorkflowEngineError(`workflow job ${jobId} cannot request merge authorization from ${current.state}`);
        }
        if (current.pullRequest === undefined)
            throw new WorkflowEngineError("merge authorization requires a persisted pull request");
        if (!current.teamRuns.review.every((run) => run.result?.reviewVerdict === "PASS" && run.result.reviewedHeadSha === current.pullRequest?.headSha)) {
            throw new WorkflowEngineError("merge authorization requires both reviewers to PASS the current exact PR head");
        }
        const pr = current.pullRequest;
        return this.update(jobId, (state) => ({
            ...withState(state, "AWAITING_MERGE_AUTHORIZATION"),
            pendingAction: {
                kind: "MERGE_AUTHORIZATION_REQUIRED",
                expectedHeadSha: pr.headSha,
                message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,
            },
            mergeAuthorization: undefined,
            lastEvent: {
                type: "MERGE_AUTHORIZATION_REQUIRED",
                class: "ACTION_REQUIRED",
                at: now(),
                message: `pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,
            },
        }));
    }
    /** Execute an already authorized exact-head merge through the persistent Website writer. */
    async runWriterMerge(jobId, signal) {
        if (this.writer === undefined)
            throw new WorkflowEngineError("workflow writer runner is not configured");
        const job = this.status(jobId);
        if (job.state !== "MERGING")
            throw new WorkflowEngineError(`workflow job ${jobId} cannot merge from ${job.state}`);
        if (job.pullRequest === undefined || job.mergeAuthorization === undefined) {
            throw new WorkflowEngineError("merge execution requires a persisted PR and exact authorization");
        }
        const pr = job.pullRequest;
        const authorization = job.mergeAuthorization;
        if (normalizeGitHubRepository(authorization.repository) !== normalizeGitHubRepository(job.repository) ||
            authorization.number !== pr.number ||
            authorization.url !== pr.url ||
            authorization.head !== pr.head ||
            authorization.headSha !== pr.headSha) {
            return this.writerBlocked(jobId, "merge authorization is stale or no longer matches the authoritative PR", "READY_FOR_MERGE_AUTHORIZATION");
        }
        const control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);
        const result = await this.writer.runControl({
            sessionId: job.writerConversation.sessionId,
            job,
            control,
            signal,
        });
        if (result.status === "UNKNOWN_CONFIRMATION") {
            return this.update(jobId, (current) => ({
                ...withState(current, "UNKNOWN_CONFIRMATION"),
                pendingAction: { kind: "UNKNOWN_CONFIRMATION", message: result.message, resumeState: "MERGING" },
                lastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        if (result.status === "BLOCKED")
            return this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");
        if (result.status !== "MERGED")
            throw new WorkflowEngineError("writer did not return a merge result during merge phase");
        if (normalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository) ||
            result.number !== pr.number ||
            result.url !== pr.url ||
            result.headSha !== authorization.headSha) {
            return this.writerBlocked(jobId, "writer merge result does not match the authorized PR/head", "READY_FOR_MERGE_AUTHORIZATION");
        }
        return this.update(jobId, (current) => ({
            ...withState(current, "DONE"),
            pendingAction: undefined,
            mergeReceipt: {
                repository: result.repository,
                number: result.number,
                url: result.url,
                headSha: result.headSha,
                mergedSha: result.mergedSha,
                executorAccountId: "chatgpt-writer",
                mergedAt: now(),
            },
            lastEvent: {
                type: "MERGED",
                class: "PROGRESS",
                at: now(),
                message: `pr=${result.url} merged_sha=${result.mergedSha}`,
            },
        }));
    }
    reviewLimitReached(jobId, expectedHeadSha) {
        return this.update(jobId, (current) => ({
            ...withState(current, "BLOCKED"),
            pendingAction: {
                kind: "REVIEW_LIMIT_REACHED",
                message: `review limit of ${this.maxReviewCycles} cycles reached`,
                expectedHeadSha,
            },
            lastEvent: { type: "REVIEW_LIMIT_REACHED", class: "ACTION_REQUIRED", at: now() },
        }));
    }
    writerBlocked(jobId, message, resumeState) {
        return this.update(jobId, (current) => ({
            ...withState(current, "BLOCKED"),
            pendingAction: { kind: "WRITER_BLOCKED", message, resumeState },
            lastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message },
        }));
    }
    recordTeamResult(jobId, phase, lane, result, reviewResult) {
        this.update(jobId, (current) => {
            const runs = current.teamRuns[phase];
            const updated = replaceLane(runs, lane, (run) => result.ok
                ? {
                    ...run,
                    status: "completed",
                    error: undefined,
                    result: {
                        finalAnswer: result.finalAnswer,
                        finalAccountId: result.finalAccountId,
                        finalProvider: result.finalProvider,
                        completedAt: now(),
                        ...(phase === "review" && reviewResult !== undefined
                            ? { reviewedHeadSha: reviewResult.reviewedHeadSha, reviewVerdict: reviewResult.verdict }
                            : {}),
                    },
                }
                : { ...run, status: "failed", error: result.error, result: undefined });
            return {
                ...current,
                revision: current.revision + 1,
                teamRuns: { ...current.teamRuns, [phase]: updated },
                updatedAt: now(),
            };
        });
    }
    update(jobId, mutate) {
        const before = this.jobs.get(jobId);
        const updated = this.jobs.update(jobId, mutate);
        const event = updated.lastEvent;
        if (event !== undefined) {
            const prior = before?.lastEvent;
            const changed = prior === undefined ||
                prior.type !== event.type ||
                prior.class !== event.class ||
                prior.at !== event.at ||
                prior.message !== event.message;
            if (changed && this.events !== undefined) {
                try {
                    this.events.publish(updated, event);
                }
                catch {
                    // Notification delivery is never part of workflow correctness.
                }
            }
        }
        return updated;
    }
    cancel(jobId) {
        return this.update(jobId, (current) => {
            if (TERMINAL_WORKFLOW_STATES.has(current.state))
                throw new WorkflowEngineError(`workflow job ${jobId} is already terminal (${current.state})`);
            return withState(current, "CANCELLED");
        });
    }
    continue(jobId) {
        return this.update(jobId, (current) => {
            if (!new Set(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state)) {
                throw new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);
            }
            return { ...withState(current, current.pendingAction?.resumeState ?? "CREATED"), pendingAction: undefined };
        });
    }
    approve(input) {
        return this.update(input.jobId, (current) => {
            if (current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
                current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED" ||
                current.pullRequest === undefined) {
                throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
            }
            if (input.expectedHeadSha === undefined ||
                input.expectedHeadSha !== current.pendingAction.expectedHeadSha ||
                input.expectedHeadSha !== current.pullRequest.headSha) {
                throw new WorkflowEngineError("merge authorization requires the exact pending PR head SHA");
            }
            const pr = current.pullRequest;
            return {
                ...withState(current, "MERGING"),
                pendingAction: undefined,
                mergeAuthorization: {
                    repository: current.repository,
                    number: pr.number,
                    url: pr.url,
                    head: pr.head,
                    headSha: pr.headSha,
                    reviewCycle: current.reviewCycle,
                    authorizedAt: now(),
                    authorizedByOwnerSessionId: current.ownerSessionId,
                },
                lastEvent: { type: "MERGE_AUTHORIZED", class: "INTERNAL", at: now() },
            };
        });
    }
    reject(input) {
        return this.update(input.jobId, (current) => {
            if (current.pendingAction === undefined)
                throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
            if (current.pendingAction.kind === "MERGE_AUTHORIZATION_REQUIRED") {
                return {
                    ...withState(current, "READY_FOR_MERGE_AUTHORIZATION"),
                    pendingAction: undefined,
                    mergeAuthorization: undefined,
                    lastEvent: { type: "MERGE_AUTHORIZATION_REJECTED", class: "INTERNAL", at: now() },
                };
            }
            return { ...withState(current, "BLOCKED"), pendingAction: undefined };
        });
    }
}
//# sourceMappingURL=engine.js.map