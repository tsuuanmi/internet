import { normalizeGitHubRepository } from "#internet/workflow/approval-policy";
import { TERMINAL_WORKFLOW_STATES } from "#internet/workflow/types";
function isAbort(error, signal) {
    return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
function shouldResume(job) {
    if (job.state === "READY_FOR_MERGE_AUTHORIZATION") {
        return job.lastEvent?.type !== "MERGE_AUTHORIZATION_REJECTED";
    }
    return new Set([
        "CREATED",
        "RESEARCH_RUNNING",
        "RESEARCH_HANDOFFS_DELIVERING",
        "WRITER_RUNNING",
        "PR_OPEN",
        "REVIEW_RUNNING",
        "REVIEW_HANDOFFS_DELIVERING",
        "WRITER_REMEDIATING",
        "MERGING",
    ]).has(job.state);
}
/** Deterministic background driver over WorkflowEngine primitives. It never decides implementation content. */
export class WorkflowDriver {
    constructor(engine, jobs) {
        this.active = new Map();
        this.disposed = false;
        this.engine = engine;
        this.jobs = jobs;
    }
    isActive(jobId) {
        return this.active.has(jobId);
    }
    enqueue(jobId) {
        if (this.disposed || this.active.has(jobId))
            return;
        const controller = new AbortController();
        const promise = this.drive(jobId, controller.signal)
            .catch((error) => {
            if (isAbort(error, controller.signal))
                return;
            try {
                const current = this.engine.status(jobId);
                if (TERMINAL_WORKFLOW_STATES.has(current.state))
                    return;
                this.engine.markRetryRequired(jobId, `automatic workflow driver failed: ${error instanceof Error ? error.message : String(error)}`, current.state);
            }
            catch {
                // Durable-state failure cannot be repaired safely by the driver itself.
            }
        })
            .finally(() => {
            const current = this.active.get(jobId);
            if (current?.promise === promise)
                this.active.delete(jobId);
        });
        this.active.set(jobId, { controller, promise });
    }
    resumeActive() {
        if (this.disposed)
            return;
        for (const job of this.jobs.list()) {
            if (shouldResume(job))
                this.enqueue(job.jobId);
        }
    }
    async cancel(jobId) {
        const run = this.active.get(jobId);
        if (run !== undefined) {
            run.controller.abort();
            await run.promise;
        }
        return this.engine.cancel(jobId);
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const runs = [...this.active.values()];
        for (const run of runs)
            run.controller.abort();
        await Promise.allSettled(runs.map((run) => run.promise));
        this.active.clear();
    }
    async drive(jobId, signal) {
        while (!signal.aborted) {
            const before = this.engine.status(jobId);
            let after;
            switch (before.state) {
                case "CREATED":
                case "RESEARCH_RUNNING":
                    after = await this.engine.runResearch(jobId, signal);
                    break;
                case "RESEARCH_HANDOFFS_DELIVERING":
                case "WRITER_RUNNING":
                    after = await this.engine.runWriterImplementation(jobId, signal);
                    break;
                case "PR_OPEN":
                case "REVIEW_RUNNING":
                    after = await this.engine.runReview(jobId, signal);
                    break;
                case "REVIEW_HANDOFFS_DELIVERING":
                case "WRITER_REMEDIATING":
                    after = await this.engine.runWriterRemediation(jobId, signal);
                    break;
                case "READY_FOR_MERGE_AUTHORIZATION":
                    if (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED")
                        return;
                    if (before.pullRequest !== undefined &&
                        before.ciReceipt !== undefined &&
                        normalizeGitHubRepository(before.ciReceipt.repository) ===
                            normalizeGitHubRepository(before.pullRequest.repository) &&
                        before.ciReceipt.number === before.pullRequest.number &&
                        before.ciReceipt.url === before.pullRequest.url &&
                        before.ciReceipt.headSha === before.pullRequest.headSha &&
                        (before.ciReceipt.status === "PASS" || before.ciReceipt.status === "NONE"))
                        after = this.engine.requestMergeAuthorization(jobId);
                    else
                        after = await this.engine.runPrHealthCheck(jobId, signal);
                    break;
                case "MERGING":
                    after = await this.engine.runWriterMerge(jobId, signal);
                    break;
                default:
                    return;
            }
            if (signal.aborted)
                return;
            if (after.state === before.state && after.revision <= before.revision) {
                throw new Error(`workflow driver made no durable progress from ${before.state}`);
            }
        }
    }
}
//# sourceMappingURL=driver.js.map