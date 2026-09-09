import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAccountDefinition, isAccountId } from "#internet/core/accounts";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES, } from "#internet/workflow/types";
const JOB_SCHEMA = "@tsuuanmi/internet-workflow-job";
export class WorkflowJobStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowJobStoreError";
    }
}
/** Durable per-job JSON storage. One job is one private atomic file. */
export class WorkflowJobStore {
    constructor(dataDir) {
        this.jobsDir = join(dataDir, "workflows", "jobs");
    }
    pathFor(jobId) {
        assertJobId(jobId);
        return join(this.jobsDir, `${jobId}.json`);
    }
    create(job) {
        const path = this.pathFor(job.jobId);
        if (existsSync(path))
            throw new WorkflowJobStoreError(`workflow job ${job.jobId} already exists`);
        ensurePrivateDirectory(this.jobsDir);
        writePrivateJson(path, job);
        return job;
    }
    list() {
        if (!existsSync(this.jobsDir))
            return [];
        const stat = lstatSync(this.jobsDir);
        if (!stat.isDirectory())
            throw new WorkflowJobStoreError("workflow jobs path is not a directory");
        return readdirSync(this.jobsDir)
            .filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const job = this.get(name.slice(0, -5));
            if (job === undefined)
                throw new WorkflowJobStoreError(`workflow job ${name} disappeared during enumeration`);
            return job;
        });
    }
    get(jobId) {
        const path = this.pathFor(jobId);
        if (!existsSync(path))
            return undefined;
        const stat = lstatSync(path);
        if (!stat.isFile())
            throw new WorkflowJobStoreError(`workflow job ${jobId} is not a regular file`);
        if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
            throw new WorkflowJobStoreError(`workflow job ${jobId} permissions must be 0600`);
        }
        try {
            return parseWorkflowJob(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowJobStoreError(`workflow job ${jobId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    update(jobId, mutate) {
        const current = this.get(jobId);
        if (current === undefined)
            throw new WorkflowJobStoreError(`workflow job ${jobId} does not exist`);
        const next = mutate(current);
        if (next.jobId !== current.jobId)
            throw new WorkflowJobStoreError("workflow job id cannot change");
        if (next.revision !== current.revision + 1) {
            throw new WorkflowJobStoreError("workflow job revision must increment by exactly one");
        }
        writePrivateJson(this.pathFor(jobId), next);
        return next;
    }
}
function assertJobId(jobId) {
    if (!/^[0-9a-f]{32}$/u.test(jobId))
        throw new WorkflowJobStoreError("workflow job id must be 32 lowercase hex characters");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTimestamp(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isState(value) {
    return typeof value === "string" && WORKFLOW_STATES.includes(value);
}
function isFullSha(value) {
    return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function assertMergeAuthorization(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid merge authorization");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid merge authorization repository");
    if (!isPositiveInteger(value.number))
        throw new Error("invalid merge authorization PR number");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
        throw new Error("invalid merge authorization URL");
    if (typeof value.head !== "string" || value.head.trim() === "")
        throw new Error("invalid merge authorization head");
    if (!isFullSha(value.headSha))
        throw new Error("invalid merge authorization head SHA");
    if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 1)
        throw new Error("invalid merge authorization review cycle");
    if (!isTimestamp(value.authorizedAt))
        throw new Error("invalid merge authorization timestamp");
    if (typeof value.authorizedByOwnerSessionId !== "string" || value.authorizedByOwnerSessionId.trim() === "")
        throw new Error("invalid merge authorization owner");
}
function assertMergeReceipt(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid merge receipt");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid merge receipt repository");
    if (!isPositiveInteger(value.number))
        throw new Error("invalid merge receipt PR number");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
        throw new Error("invalid merge receipt URL");
    if (!isFullSha(value.headSha) || !isFullSha(value.mergedSha))
        throw new Error("invalid merge receipt SHA");
    if (value.executorAccountId !== "chatgpt-writer")
        throw new Error("invalid merge receipt executor");
    if (!isTimestamp(value.mergedAt))
        throw new Error("invalid merge receipt timestamp");
}
function assertTeamResult(value, phase) {
    if (!isRecord(value))
        throw new Error("invalid team result");
    if (typeof value.finalAnswer !== "string")
        throw new Error("invalid team final answer");
    if (!isAccountId(value.finalAccountId))
        throw new Error("invalid team final account");
    const provider = getAccountDefinition(value.finalAccountId).provider;
    if (value.finalProvider !== provider)
        throw new Error("team final provider does not match account identity");
    if (!isTimestamp(value.completedAt))
        throw new Error("invalid team completion timestamp");
    if (phase === "review") {
        if (!isFullSha(value.reviewedHeadSha))
            throw new Error("review result requires exact reviewed head SHA");
        if (value.reviewVerdict !== "PASS" && value.reviewVerdict !== "CHANGES_REQUIRED") {
            throw new Error("invalid review verdict");
        }
    }
    else if (value.reviewedHeadSha !== undefined || value.reviewVerdict !== undefined) {
        throw new Error("research result cannot carry review metadata");
    }
}
function assertTeamRun(value, phase, expectedLane, expectedSessionId) {
    if (!isRecord(value))
        throw new Error(`invalid ${phase} team run`);
    if (value.lane !== expectedLane)
        throw new Error(`invalid ${phase} lane order`);
    if (typeof value.status !== "string" || !WORKFLOW_TEAM_STATUSES.includes(value.status)) {
        throw new Error(`invalid ${phase} team status`);
    }
    if (typeof value.attempts !== "number" || !Number.isSafeInteger(value.attempts) || value.attempts < 0) {
        throw new Error(`invalid ${phase} team attempts`);
    }
    if (value.sessionId !== expectedSessionId)
        throw new Error(`${phase} team session identity mismatch`);
    if (value.error !== undefined && (typeof value.error !== "string" || value.error.trim() === "")) {
        throw new Error(`invalid ${phase} team error`);
    }
    if (value.status === "completed") {
        assertTeamResult(value.result, phase);
        if (value.error !== undefined)
            throw new Error(`completed ${phase} run cannot carry an error`);
    }
    else {
        if (value.result !== undefined)
            throw new Error(`incomplete ${phase} run cannot carry a result`);
        if (value.status === "failed" && value.error === undefined)
            throw new Error(`failed ${phase} run requires an error`);
        if (value.status !== "failed" && value.error !== undefined)
            throw new Error(`non-failed ${phase} run cannot carry an error`);
    }
}
function assertTeamRuns(value, ownerSessionId, jobId) {
    if (!isRecord(value) || !Array.isArray(value.research) || !Array.isArray(value.review)) {
        throw new Error("invalid team run state");
    }
    if (value.research.length !== 2 || value.review.length !== 2)
        throw new Error("workflow requires exactly two lanes per phase");
    for (const phase of ["research", "review"]) {
        const runs = value[phase];
        assertTeamRun(runs[0], phase, "A", `${ownerSessionId}:workflow:${jobId}:${phase}:A`);
        assertTeamRun(runs[1], phase, "B", `${ownerSessionId}:workflow:${jobId}:${phase}:B`);
    }
}
function assertAccountRouting(value) {
    if (!isRecord(value) || !Array.isArray(value.thinkerAccounts))
        throw new Error("invalid account routing");
    if (value.thinkerAccounts.length !== 2 ||
        value.thinkerAccounts[0] !== "chatgpt-thinker" ||
        value.thinkerAccounts[1] !== "gemini-thinker" ||
        value.writerAccount !== "chatgpt-writer" ||
        value.synthesizerAccount !== "chatgpt-thinker") {
        throw new Error("workflow account routing authority mismatch");
    }
}
function assertWriterConversation(value, ownerSessionId, jobId) {
    if (!isRecord(value) || value.accountId !== "chatgpt-writer")
        throw new Error("invalid writer conversation account");
    if (value.sessionId !== `${ownerSessionId}:workflow:${jobId}:writer`)
        throw new Error("writer conversation identity mismatch");
}
function assertHandoffReceipts(value) {
    if (!Array.isArray(value))
        throw new Error("invalid handoff receipts");
    const ids = new Set();
    for (const item of value) {
        if (!isRecord(item))
            throw new Error("invalid handoff receipt");
        if (typeof item.handoffId !== "string" || !/^[0-9a-f]{64}$/u.test(item.handoffId))
            throw new Error("invalid handoff receipt id");
        if (ids.has(item.handoffId))
            throw new Error("duplicate handoff receipt id");
        ids.add(item.handoffId);
        if (typeof item.source !== "string" || item.source.trim() === "")
            throw new Error("invalid handoff receipt source");
        if (!isAccountId(item.recipient))
            throw new Error("invalid handoff receipt recipient");
        if (!isPositiveInteger(item.sequence))
            throw new Error("invalid handoff receipt sequence");
        if (typeof item.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(item.payloadHash))
            throw new Error("invalid handoff receipt hash");
        if (item.status !== "pending" && item.status !== "delivered")
            throw new Error("invalid handoff receipt status");
    }
}
function assertPullRequest(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid pull request receipt");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid pull request repository");
    if (!isPositiveInteger(value.number))
        throw new Error("invalid pull request number");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
        throw new Error("invalid pull request URL");
    if (typeof value.base !== "string" || value.base.trim() === "")
        throw new Error("invalid pull request base");
    if (typeof value.head !== "string" || value.head.trim() === "")
        throw new Error("invalid pull request head");
    if (!isFullSha(value.headSha))
        throw new Error("invalid pull request head SHA");
}
function assertCiReceipt(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid CI receipt");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid CI repository");
    if (!isPositiveInteger(value.number))
        throw new Error("invalid CI PR number");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
        throw new Error("invalid CI PR URL");
    if (!isFullSha(value.headSha))
        throw new Error("invalid CI head SHA");
    if (!["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"].includes(String(value.status)))
        throw new Error("invalid CI status");
    if (!isTimestamp(value.checkedAt))
        throw new Error("invalid CI checked timestamp");
}
function assertPendingAction(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid pending action");
    if (![
        "MERGE_AUTHORIZATION_REQUIRED",
        "WRITER_BLOCKED",
        "UNKNOWN_CONFIRMATION",
        "REVIEW_LIMIT_REACHED",
        "ACCOUNT_REAUTH_REQUIRED",
        "CI_HEALTH_FAILED",
        "CI_HEALTH_UNKNOWN",
        "RETRY_REQUIRED",
    ].includes(String(value.kind)))
        throw new Error("invalid pending action kind");
    if (typeof value.message !== "string" || value.message.trim() === "")
        throw new Error("invalid pending action message");
    if (value.expectedHeadSha !== undefined && !isFullSha(value.expectedHeadSha))
        throw new Error("invalid pending action head SHA");
    if (value.resumeState !== undefined && !isState(value.resumeState))
        throw new Error("invalid pending action resume state");
}
function assertEvent(value) {
    if (value === undefined)
        return;
    if (!isRecord(value))
        throw new Error("invalid workflow event");
    if (typeof value.type !== "string" || value.type.trim() === "")
        throw new Error("invalid workflow event type");
    if (value.class !== "INTERNAL" && value.class !== "PROGRESS" && value.class !== "ACTION_REQUIRED") {
        throw new Error("invalid workflow event class");
    }
    if (!isTimestamp(value.at))
        throw new Error("invalid workflow event timestamp");
    if (value.message !== undefined && typeof value.message !== "string")
        throw new Error("invalid workflow event message");
}
export function parseWorkflowJob(value) {
    if (!isRecord(value))
        throw new Error("job must be an object");
    if (value.schema !== JOB_SCHEMA || value.version !== 1)
        throw new Error("unsupported workflow job schema");
    if (typeof value.jobId !== "string")
        throw new Error("invalid job id");
    assertJobId(value.jobId);
    if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) {
        throw new Error("invalid job revision");
    }
    if (typeof value.ownerSessionId !== "string" || value.ownerSessionId.trim() === "")
        throw new Error("invalid owner session id");
    if (typeof value.objective !== "string" || value.objective.trim() === "")
        throw new Error("invalid objective");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid repository");
    if (typeof value.baseRevision !== "string" || !/^[0-9a-f]{40}$/u.test(value.baseRevision)) {
        throw new Error("invalid base revision");
    }
    if (!isState(value.state))
        throw new Error("invalid workflow state");
    if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt))
        throw new Error("invalid timestamps");
    assertTeamRuns(value.teamRuns, value.ownerSessionId, value.jobId);
    assertAccountRouting(value.accountRouting);
    assertWriterConversation(value.writerConversation, value.ownerSessionId, value.jobId);
    assertHandoffReceipts(value.handoffReceipts);
    assertPullRequest(value.pullRequest);
    assertCiReceipt(value.ciReceipt);
    assertPendingAction(value.pendingAction);
    assertEvent(value.lastEvent);
    if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {
        throw new Error("invalid review cycle");
    }
    assertMergeAuthorization(value.mergeAuthorization);
    assertMergeReceipt(value.mergeReceipt);
    if (value.state === "FAILED_RETRYABLE") {
        if (!isRecord(value.pendingAction) ||
            value.pendingAction.kind !== "RETRY_REQUIRED" ||
            value.pendingAction.resumeState === undefined) {
            throw new Error("FAILED_RETRYABLE workflow requires an explicit retry action and resume state");
        }
    }
    if (value.ciReceipt !== undefined) {
        const ci = value.ciReceipt;
        if (!isRecord(ci) || !isRecord(value.pullRequest))
            throw new Error("CI receipt requires a pull request receipt");
        if (ci.number !== value.pullRequest.number ||
            ci.url !== value.pullRequest.url ||
            ci.headSha !== value.pullRequest.headSha)
            throw new Error("CI receipt does not match pull request receipt");
    }
    if (value.mergeAuthorization !== undefined) {
        const authorization = value.mergeAuthorization;
        if (!isRecord(authorization))
            throw new Error("invalid merge authorization");
        if (!isRecord(value.pullRequest))
            throw new Error("merge authorization requires a pull request receipt");
        if (authorization.number !== value.pullRequest.number ||
            authorization.url !== value.pullRequest.url ||
            authorization.head !== value.pullRequest.head ||
            authorization.headSha !== value.pullRequest.headSha)
            throw new Error("merge authorization does not match pull request receipt");
    }
    if (value.mergeReceipt !== undefined) {
        const mergeReceipt = value.mergeReceipt;
        if (!isRecord(mergeReceipt))
            throw new Error("invalid merge receipt");
        if (value.state !== "DONE")
            throw new Error("merge receipt requires DONE state");
        if (!isRecord(value.pullRequest))
            throw new Error("merge receipt requires a pull request receipt");
        if (mergeReceipt.number !== value.pullRequest.number ||
            mergeReceipt.url !== value.pullRequest.url ||
            mergeReceipt.headSha !== value.pullRequest.headSha)
            throw new Error("merge receipt does not match pull request receipt");
    }
    if (value.state === "DONE" && value.mergeReceipt === undefined)
        throw new Error("DONE workflow requires a merge receipt");
    return value;
}
//# sourceMappingURL=job-store.js.map