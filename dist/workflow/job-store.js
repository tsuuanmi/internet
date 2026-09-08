import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_STATES } from "#internet/workflow/types";
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
    if (!isRecord(value.teamRuns) || !Array.isArray(value.teamRuns.research) || !Array.isArray(value.teamRuns.review)) {
        throw new Error("invalid team run state");
    }
    if (!isRecord(value.accountRouting) || !isRecord(value.writerConversation))
        throw new Error("invalid account routing");
    if (!Array.isArray(value.handoffReceipts))
        throw new Error("invalid handoff receipts");
    if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {
        throw new Error("invalid review cycle");
    }
    return value;
}
//# sourceMappingURL=job-store.js.map