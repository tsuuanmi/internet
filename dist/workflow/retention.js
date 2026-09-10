import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
export const WORKFLOW_RETENTION_AUDIT_SCHEMA = "@tsuuanmi/internet-workflow-retention-audit";
export const DEFAULT_WORKFLOW_RETENTION_POLICY = {
    doneDays: 30,
    cancelledDays: 14,
};
export class WorkflowRetentionError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowRetentionError";
    }
}
function retentionDaysFor(state, policy) {
    if (state === "DONE")
        return policy.doneDays;
    if (state === "CANCELLED")
        return policy.cancelledDays;
    return undefined;
}
function assertPolicy(policy) {
    for (const [name, value] of Object.entries(policy)) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new WorkflowRetentionError(`${name} must be a positive integer`);
    }
}
function candidateFor(job, nowMs, policy) {
    const retentionDays = retentionDaysFor(job.state, policy);
    if (retentionDays === undefined)
        return undefined;
    const updatedMs = Date.parse(job.updatedAt);
    const eligibleMs = updatedMs + retentionDays * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(updatedMs) || nowMs < eligibleMs)
        return undefined;
    return {
        jobId: job.jobId,
        state: job.state,
        repository: job.repository,
        updatedAt: job.updatedAt,
        retentionDays,
        eligibleAt: new Date(eligibleMs).toISOString(),
    };
}
function auditId(jobId, expectedUpdatedAt) {
    return createHash("sha256").update(`${jobId}\0${expectedUpdatedAt}`, "utf8").digest("hex");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseCompletedAudit(value) {
    if (!isRecord(value) || value.schema !== WORKFLOW_RETENTION_AUDIT_SCHEMA || value.version !== 1)
        return undefined;
    if (value.status !== "COMPLETED")
        return undefined;
    return value;
}
function assertPrivateRegularFile(path, label) {
    const file = lstatSync(path);
    if (!file.isFile())
        throw new WorkflowRetentionError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (file.mode & 0o077) !== 0)
        throw new WorkflowRetentionError(`${label} permissions must be 0600`);
}
/** Explicit operator-only retention manager. It never schedules or performs automatic deletion. */
export class WorkflowRetentionManager {
    constructor(dataDir, jobs, policy = DEFAULT_WORKFLOW_RETENTION_POLICY, now = () => new Date()) {
        assertPolicy(policy);
        this.jobs = jobs;
        this.policy = policy;
        this.now = now;
        this.auditDir = join(dataDir, "workflows", "cleanup-audit");
        this.handoffRoot = join(dataDir, "workflows", "handoffs");
        this.traceRoot = join(dataDir, "workflows", "team-traces");
    }
    preview() {
        const nowMs = this.now().getTime();
        return this.jobs
            .list()
            .map((job) => candidateFor(job, nowMs, this.policy))
            .filter((item) => item !== undefined)
            .sort((a, b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.jobId.localeCompare(b.jobId));
    }
    cleanup(input) {
        if (input.operatorSessionId.trim() === "")
            throw new WorkflowRetentionError("operator session id is required");
        if (!Number.isFinite(Date.parse(input.expectedUpdatedAt)))
            throw new WorkflowRetentionError("expectedUpdatedAt must be an ISO timestamp");
        const id = auditId(input.jobId, input.expectedUpdatedAt);
        const auditPath = join(this.auditDir, `${id}.json`);
        if (existsSync(auditPath)) {
            const completed = parseCompletedAudit(JSON.parse(readFileSync(auditPath, "utf8")));
            if (completed !== undefined)
                return completed;
        }
        const job = this.jobs.get(input.jobId);
        if (job === undefined)
            throw new WorkflowRetentionError(`workflow job ${input.jobId} does not exist`);
        if (job.updatedAt !== input.expectedUpdatedAt)
            throw new WorkflowRetentionError("workflow job changed after cleanup preview; refresh before deleting");
        const candidate = candidateFor(job, this.now().getTime(), this.policy);
        if (candidate === undefined)
            throw new WorkflowRetentionError("workflow job is not an eligible terminal cleanup candidate");
        const requestedAt = this.now().toISOString();
        const base = {
            schema: WORKFLOW_RETENTION_AUDIT_SCHEMA,
            version: 1,
            auditId: id,
            jobId: job.jobId,
            state: candidate.state,
            repository: job.repository,
            jobUpdatedAt: job.updatedAt,
            retentionDays: candidate.retentionDays,
            eligibleAt: candidate.eligibleAt,
            operatorSessionId: input.operatorSessionId,
            requestedAt,
            status: "STARTED",
            deletedHandoffFiles: 0,
        };
        ensurePrivateDirectory(this.auditDir);
        writePrivateJson(auditPath, base);
        let deletedHandoffFiles = 0;
        try {
            const jobHandoffDir = join(this.handoffRoot, job.jobId);
            if (existsSync(jobHandoffDir)) {
                const stat = lstatSync(jobHandoffDir);
                if (!stat.isDirectory())
                    throw new WorkflowRetentionError("workflow handoff path is not a directory");
                const names = readdirSync(jobHandoffDir).sort();
                for (const name of names) {
                    if (!/^[0-9a-f]{64}\.json$/u.test(name))
                        throw new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);
                    assertPrivateRegularFile(join(jobHandoffDir, name), `handoff cleanup target ${name}`);
                }
                for (const name of names) {
                    unlinkSync(join(jobHandoffDir, name));
                    deletedHandoffFiles += 1;
                }
                rmdirSync(jobHandoffDir);
            }
            const tracePath = join(this.traceRoot, `${job.jobId}.json`);
            if (existsSync(tracePath)) {
                assertPrivateRegularFile(tracePath, "workflow team trace cleanup target");
                unlinkSync(tracePath);
            }
            const jobPath = this.jobs.pathFor(job.jobId);
            assertPrivateRegularFile(jobPath, "workflow cleanup target");
            unlinkSync(jobPath);
            const completed = {
                ...base,
                status: "COMPLETED",
                deletedHandoffFiles,
                completedAt: this.now().toISOString(),
            };
            writePrivateJson(auditPath, completed);
            return completed;
        }
        catch (error) {
            const failed = {
                ...base,
                status: "FAILED",
                deletedHandoffFiles,
                error: error instanceof Error ? error.message : String(error),
            };
            writePrivateJson(auditPath, failed);
            throw error;
        }
    }
}
//# sourceMappingURL=retention.js.map