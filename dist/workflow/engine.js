import { randomBytes } from "node:crypto";
import { createWorkflowControlMessage } from "#internet/workflow/control";
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
export class WorkflowEngine {
    constructor(jobs, teams, prompts = new WorkflowTeamPromptBuilder(), handoffs, writer) {
        this.jobs = jobs;
        this.teams = teams;
        this.prompts = prompts;
        this.handoffs = handoffs;
        this.writer = writer;
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
            return this.jobs.update(jobId, (current) => withState(current, "RESEARCH_HANDOFFS_DELIVERING"));
        }
        const running = this.jobs.update(jobId, (current) => {
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
        return this.jobs.update(jobId, (current) => {
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
        this.jobs.update(jobId, (current) => ({
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
        return this.jobs.update(jobId, (current) => {
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
            : this.jobs.update(jobId, (state) => ({
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
            return this.jobs.update(jobId, (current) => ({
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
            return this.jobs.update(jobId, (current) => ({
                ...withState(current, "BLOCKED"),
                pendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_RUNNING" },
                lastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },
            }));
        }
        return this.jobs.update(jobId, (current) => ({
            ...withState(current, "PR_OPEN"),
            pullRequest: result.pullRequest,
            pendingAction: undefined,
            lastEvent: { type: "PR_OPENED", class: "PROGRESS", at: now(), message: result.pullRequest.url },
        }));
    }
    recordTeamResult(jobId, phase, lane, result) {
        this.jobs.update(jobId, (current) => {
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
                        ...(phase === "review" && current.pullRequest !== undefined
                            ? { reviewedHeadSha: current.pullRequest.headSha }
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
    cancel(jobId) {
        return this.jobs.update(jobId, (current) => {
            if (TERMINAL_WORKFLOW_STATES.has(current.state))
                throw new WorkflowEngineError(`workflow job ${jobId} is already terminal (${current.state})`);
            return withState(current, "CANCELLED");
        });
    }
    continue(jobId) {
        return this.jobs.update(jobId, (current) => {
            if (!new Set(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state)) {
                throw new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);
            }
            return { ...withState(current, current.pendingAction?.resumeState ?? "CREATED"), pendingAction: undefined };
        });
    }
    approve(input) {
        return this.jobs.update(input.jobId, (current) => {
            if (current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
                current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED") {
                throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
            }
            if (current.pendingAction.expectedHeadSha !== undefined &&
                input.expectedHeadSha !== current.pendingAction.expectedHeadSha) {
                throw new WorkflowEngineError("merge authorization head SHA does not match the pending action");
            }
            return { ...withState(current, "READY_FOR_MERGE_AUTHORIZATION"), pendingAction: undefined };
        });
    }
    reject(input) {
        return this.jobs.update(input.jobId, (current) => {
            if (current.pendingAction === undefined)
                throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
            return { ...withState(current, "BLOCKED"), pendingAction: undefined };
        });
    }
}
//# sourceMappingURL=engine.js.map