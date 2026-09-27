import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ProviderTurnReceiptStore } from "#internet/browser/turn-receipts";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { workflowJobIsTerminal } from "#internet/workflow/types";
export const WORKFLOW_RETENTION_AUDIT_SCHEMA = "@tsuuanmi/internet-workflow-retention-audit";
export const DEFAULT_WORKFLOW_RETENTION_POLICY = {
    completedDays: 30,
    cancelledDays: 14,
};
export class WorkflowRetentionError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowRetentionError";
    }
}
function retentionDaysFor(lifecycle, policy) {
    if (lifecycle === "COMPLETED")
        return policy.completedDays;
    if (lifecycle === "CANCELLED")
        return policy.cancelledDays;
    return undefined;
}
function assertPolicy(policy) {
    for (const [name, value] of Object.entries(policy)) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new WorkflowRetentionError(`${name} must be a positive integer`);
        }
    }
}
function candidateFor(job, nowMs, policy) {
    const retentionDays = retentionDaysFor(job.graph.lifecycle, policy);
    if (retentionDays === undefined)
        return undefined;
    const updatedMs = Date.parse(job.updatedAt);
    const eligibleMs = updatedMs + retentionDays * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(updatedMs) || nowMs < eligibleMs)
        return undefined;
    return {
        jobId: job.jobId,
        lifecycle: job.graph.lifecycle,
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
    if (!isRecord(value) ||
        value.schema !== WORKFLOW_RETENTION_AUDIT_SCHEMA ||
        value.version !== 2 ||
        value.status !== "COMPLETED") {
        return undefined;
    }
    return value;
}
function assertPrivateRegularFile(path, label) {
    const file = lstatSync(path);
    if (!file.isFile())
        throw new WorkflowRetentionError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (file.mode & 0o077) !== 0) {
        throw new WorkflowRetentionError(`${label} permissions must be 0600`);
    }
}
function deleteArtifactDirectory(path, filename, label) {
    if (!existsSync(path))
        return 0;
    if (!lstatSync(path).isDirectory())
        throw new WorkflowRetentionError(`${label} path is not a directory`);
    const names = readdirSync(path).sort();
    for (const name of names) {
        if (!filename.test(name))
            throw new WorkflowRetentionError(`unexpected file in ${label} directory: ${name}`);
        assertPrivateRegularFile(join(path, name), `${label} cleanup target ${name}`);
    }
    for (const name of names)
        unlinkSync(join(path, name));
    rmdirSync(path);
    return names.length;
}
function workflowProviderSessionIds(job) {
    const prefix = `${job.ownerSessionId}:workflow:${job.jobId}`;
    return [
        `${prefix}:research:A`,
        `${prefix}:research:B`,
        `${prefix}:review:A`,
        `${prefix}:review:B`,
        job.writerConversation.sessionId,
    ];
}
function deleteWorkflowProviderTurnReceipts(dataDir, job) {
    const accounts = new Set([...job.accountRouting.thinkerAccounts, job.accountRouting.writerAccount]);
    const sessions = workflowProviderSessionIds(job);
    let deletedFiles = 0;
    for (const accountId of accounts) {
        const receipts = new ProviderTurnReceiptStore(dataDir, accountId);
        for (const sessionId of sessions)
            deletedFiles += receipts.deleteSession(sessionId);
    }
    return deletedFiles;
}
function deleteWorkflowArtifacts(dataDir, jobs, job) {
    const workflowRoot = join(dataDir, "workflows");
    let deletedFiles = 0;
    deletedFiles += deleteArtifactDirectory(join(workflowRoot, "handoffs", job.jobId), /^[0-9a-f]{64}\.json$/u, "workflow handoff");
    deletedFiles += deleteArtifactDirectory(join(workflowRoot, "node-results", job.jobId), /^[0-9a-f]{64}\.json$/u, "workflow node result");
    deletedFiles += deleteArtifactDirectory(join(workflowRoot, "events", job.jobId), /^\d{12}\.json$/u, "workflow event");
    deletedFiles += deleteWorkflowProviderTurnReceipts(dataDir, job);
    const jobPath = jobs.pathFor(job.jobId);
    assertPrivateRegularFile(jobPath, "workflow job cleanup target");
    unlinkSync(jobPath);
    return deletedFiles + 1;
}
export class WorkflowRetentionManager {
    constructor(dataDir, jobs, policy = DEFAULT_WORKFLOW_RETENTION_POLICY, now = () => new Date()) {
        assertPolicy(policy);
        this.dataDir = dataDir;
        this.jobs = jobs;
        this.policy = policy;
        this.now = now;
        this.auditDir = join(dataDir, "workflows", "cleanup-audit");
    }
    preview() {
        const nowMs = this.now().getTime();
        return this.jobs
            .list()
            .map((job) => candidateFor(job, nowMs, this.policy))
            .filter((item) => item !== undefined)
            .sort((a, b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.jobId.localeCompare(b.jobId));
    }
    deleteNow(input) {
        if (input.operatorSessionId.trim() === "")
            throw new WorkflowRetentionError("operator session id is required");
        if (!Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
            throw new WorkflowRetentionError("expectedUpdatedAt must be an ISO timestamp");
        }
        const job = this.jobs.get(input.jobId);
        if (job === undefined)
            throw new WorkflowRetentionError(`workflow job ${input.jobId} does not exist`);
        if (job.updatedAt !== input.expectedUpdatedAt) {
            throw new WorkflowRetentionError("workflow job changed before deletion; refresh before deleting");
        }
        if (!workflowJobIsTerminal(job)) {
            throw new WorkflowRetentionError("workflow job must be terminal before deletion");
        }
        const deletedFiles = deleteWorkflowArtifacts(this.dataDir, this.jobs, job);
        return {
            jobId: job.jobId,
            lifecycle: job.graph.lifecycle,
            repository: job.repository,
            operatorSessionId: input.operatorSessionId,
            deletedFiles,
            deletedAt: this.now().toISOString(),
        };
    }
    cleanup(input) {
        if (input.operatorSessionId.trim() === "")
            throw new WorkflowRetentionError("operator session id is required");
        if (!Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
            throw new WorkflowRetentionError("expectedUpdatedAt must be an ISO timestamp");
        }
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
        if (job.updatedAt !== input.expectedUpdatedAt) {
            throw new WorkflowRetentionError("workflow job changed after cleanup preview; refresh before deleting");
        }
        const candidate = candidateFor(job, this.now().getTime(), this.policy);
        if (candidate === undefined) {
            throw new WorkflowRetentionError("workflow job is not an eligible terminal cleanup candidate");
        }
        const requestedAt = this.now().toISOString();
        const base = {
            schema: WORKFLOW_RETENTION_AUDIT_SCHEMA,
            version: 2,
            auditId: id,
            jobId: job.jobId,
            lifecycle: candidate.lifecycle,
            repository: job.repository,
            jobUpdatedAt: job.updatedAt,
            retentionDays: candidate.retentionDays,
            eligibleAt: candidate.eligibleAt,
            operatorSessionId: input.operatorSessionId,
            requestedAt,
            status: "STARTED",
            deletedFiles: 0,
        };
        ensurePrivateDirectory(this.auditDir);
        writePrivateJson(auditPath, base);
        try {
            const deletedFiles = deleteWorkflowArtifacts(this.dataDir, this.jobs, job);
            const completed = {
                ...base,
                status: "COMPLETED",
                deletedFiles,
                completedAt: this.now().toISOString(),
            };
            writePrivateJson(auditPath, completed);
            return completed;
        }
        catch (error) {
            const failed = {
                ...base,
                status: "FAILED",
                error: error instanceof Error ? error.message : String(error),
            };
            writePrivateJson(auditPath, failed);
            throw error;
        }
    }
}
//# sourceMappingURL=retention.js.map