import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { accountHasCapability, isAccountId } from "#internet/core/accounts";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { assertWorkflowGraph } from "#internet/workflow/graph";
import { WORKFLOW_CI_STATUSES, WORKFLOW_PENDING_ACTION_KINDS } from "#internet/workflow/types";
const JOB_SCHEMA = "@tsuuanmi/internet-workflow-job";
export class WorkflowJobStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowJobStoreError";
    }
}
export class WorkflowJobStore {
    constructor(dataDir) {
        this.jobsDir = join(dataDir, "workflows", "jobs");
    }
    pathFor(jobId) {
        assertJobId(jobId);
        return join(this.jobsDir, `${jobId}.json`);
    }
    create(job) {
        parseWorkflowJob(job);
        const path = this.pathFor(job.jobId);
        if (existsSync(path))
            throw new WorkflowJobStoreError(`workflow job ${job.jobId} already exists`);
        ensurePrivateDirectory(this.jobsDir);
        writePrivateJson(path, job);
        return job;
    }
    get(jobId) {
        const path = this.pathFor(jobId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow job ${jobId}`);
        try {
            return parseWorkflowJob(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowJobStoreError(`workflow job ${jobId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    list() {
        if (!existsSync(this.jobsDir))
            return [];
        if (!lstatSync(this.jobsDir).isDirectory())
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
    update(jobId, expectedRevision, mutate) {
        const current = this.get(jobId);
        if (current === undefined)
            throw new WorkflowJobStoreError(`workflow job ${jobId} does not exist`);
        if (current.revision !== expectedRevision) {
            throw new WorkflowJobStoreError(`workflow job ${jobId} revision conflict: expected ${expectedRevision}, current ${current.revision}`);
        }
        const next = mutate(current);
        if (next.jobId !== current.jobId)
            throw new WorkflowJobStoreError("workflow job id cannot change");
        if (next.revision !== current.revision + 1)
            throw new WorkflowJobStoreError("workflow job revision must increment by one");
        parseWorkflowJob(next);
        writePrivateJson(this.pathFor(jobId), next);
        return next;
    }
}
export function parseWorkflowJob(value) {
    if (!isRecord(value) || value.schema !== JOB_SCHEMA || value.version !== 2) {
        throw new Error("unsupported workflow job schema; only graph job version 2 is accepted");
    }
    assertJobIdValue(value.jobId);
    if (!isPositiveInteger(value.revision))
        throw new Error("invalid workflow job revision");
    if (typeof value.ownerSessionId !== "string" || value.ownerSessionId.trim() === "")
        throw new Error("invalid workflow owner");
    if (typeof value.objective !== "string" || value.objective.trim() === "")
        throw new Error("invalid workflow objective");
    if (typeof value.repository !== "string" || value.repository.trim() === "")
        throw new Error("invalid workflow repository");
    if (!isFullSha(value.baseRevision))
        throw new Error("invalid workflow base revision");
    if (!isRecord(value.graph))
        throw new Error("invalid workflow graph");
    assertWorkflowGraph(value.graph);
    assertAccountRouting(value.accountRouting);
    assertWriterConversation(value.writerConversation, value.ownerSessionId, value.jobId);
    assertHandoffReceipts(value.handoffReceipts);
    assertPullRequest(value.pullRequest);
    assertCiReceipt(value.ciReceipt);
    assertMergeAuthorization(value.mergeAuthorization);
    assertMergeReceipt(value.mergeReceipt);
    if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0)
        throw new Error("invalid review cycle");
    assertPendingAction(value.pendingAction);
    assertEvent(value.lastEvent);
    if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt))
        throw new Error("invalid workflow timestamps");
    return value;
}
function assertJobId(jobId) {
    if (!/^[0-9a-f]{32}$/u.test(jobId))
        throw new WorkflowJobStoreError("workflow job id must be 32 lowercase hex characters");
}
function assertJobIdValue(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{32}$/u.test(value))
        throw new Error("invalid workflow job id");
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowJobStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
        throw new WorkflowJobStoreError(`${label} permissions must be 0600`);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTimestamp(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isFullSha(value) {
    return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function assertAccountRouting(value) {
    if (!isRecord(value) || !Array.isArray(value.thinkerAccounts) || value.thinkerAccounts.length !== 2)
        throw new Error("invalid workflow account routing");
    const [first, second] = value.thinkerAccounts;
    if (!isAccountId(first) || !isAccountId(second) || first === second)
        throw new Error("invalid workflow thinker routing");
    for (const accountId of [first, second]) {
        if (!accountHasCapability(accountId, "team.reason") || !accountHasCapability(accountId, "team.review"))
            throw new Error(`workflow thinker account ${accountId} lacks required capabilities`);
    }
    if (value.writerAccount !== "chatgpt-writer")
        throw new Error("workflow writer authority mismatch");
    if (!isAccountId(value.synthesizerAccount) || !value.thinkerAccounts.includes(value.synthesizerAccount))
        throw new Error("invalid workflow synthesizer routing");
}
function assertWriterConversation(value, ownerSessionId, jobId) {
    if (!isRecord(value) || value.accountId !== "chatgpt-writer")
        throw new Error("invalid writer conversation");
    if (value.sessionId !== `${ownerSessionId}:workflow:${jobId}:writer`)
        throw new Error("writer conversation identity mismatch");
}
function assertHandoffReceipts(value) {
    if (!Array.isArray(value))
        throw new Error("invalid handoff receipts");
    const ids = new Set();
    for (const item of value) {
        if (!isRecord(item) || typeof item.handoffId !== "string" || !/^[0-9a-f]{64}$/u.test(item.handoffId))
            throw new Error("invalid handoff receipt");
        if (ids.has(item.handoffId))
            throw new Error("duplicate handoff receipt id");
        ids.add(item.handoffId);
        if (typeof item.source !== "string" || item.source.trim() === "" || !isAccountId(item.recipient))
            throw new Error("invalid handoff identity");
        if (!isPositiveInteger(item.sequence) ||
            typeof item.payloadHash !== "string" ||
            !/^[0-9a-f]{64}$/u.test(item.payloadHash))
            throw new Error("invalid handoff receipt fields");
        if (item.status !== "pending" && item.status !== "delivered")
            throw new Error("invalid handoff status");
    }
}
function assertPullRequest(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) || typeof value.repository !== "string" || !isPositiveInteger(value.number))
        throw new Error("invalid pull request receipt");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
        throw new Error("invalid pull request URL");
    if (typeof value.base !== "string" || typeof value.head !== "string" || !isFullSha(value.headSha))
        throw new Error("invalid pull request identity");
}
function assertCiReceipt(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) || typeof value.repository !== "string" || !isPositiveInteger(value.number))
        throw new Error("invalid CI receipt");
    if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url) || !isFullSha(value.headSha))
        throw new Error("invalid CI identity");
    if (typeof value.status !== "string" || !WORKFLOW_CI_STATUSES.includes(value.status))
        throw new Error("invalid CI status");
    if (!isTimestamp(value.checkedAt))
        throw new Error("invalid CI timestamp");
}
function assertMergeAuthorization(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) || typeof value.repository !== "string" || !isPositiveInteger(value.number))
        throw new Error("invalid merge authorization");
    if (typeof value.url !== "string" || typeof value.head !== "string" || !isFullSha(value.headSha))
        throw new Error("invalid merge authorization identity");
    if (!isPositiveInteger(value.reviewCycle) ||
        !isTimestamp(value.authorizedAt) ||
        typeof value.authorizedByOwnerSessionId !== "string")
        throw new Error("invalid merge authorization fields");
}
function assertMergeReceipt(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) || typeof value.repository !== "string" || !isPositiveInteger(value.number))
        throw new Error("invalid merge receipt");
    if (typeof value.url !== "string" ||
        !isFullSha(value.headSha) ||
        !isFullSha(value.mergedSha) ||
        value.executorAccountId !== "chatgpt-writer" ||
        !isTimestamp(value.mergedAt))
        throw new Error("invalid merge receipt fields");
}
function assertPendingAction(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) ||
        typeof value.kind !== "string" ||
        !WORKFLOW_PENDING_ACTION_KINDS.includes(value.kind))
        throw new Error("invalid pending action");
    if (typeof value.message !== "string" || value.message.trim() === "")
        throw new Error("invalid pending action message");
    if (value.nodeId !== undefined && (typeof value.nodeId !== "string" || value.nodeId.trim() === ""))
        throw new Error("invalid pending action node");
    if (value.expectedHeadSha !== undefined && !isFullSha(value.expectedHeadSha))
        throw new Error("invalid pending action head SHA");
}
function assertEvent(value) {
    if (value === undefined)
        return;
    if (!isRecord(value) ||
        typeof value.type !== "string" ||
        !["INTERNAL", "PROGRESS", "ACTION_REQUIRED"].includes(String(value.class)) ||
        !isTimestamp(value.at))
        throw new Error("invalid workflow event");
}
//# sourceMappingURL=job-store.js.map