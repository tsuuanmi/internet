import { randomBytes } from "node:crypto";
import { workflowJobIsTerminal } from "#internet/workflow/types";
function isAbort(error, signal) {
    return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
function shouldResume(job) {
    return !workflowJobIsTerminal(job) && (job.graph.lifecycle === "RUNNING" || job.graph.lifecycle === "RECOVERING");
}
function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}
/** Background owner for one durable graph scheduler. Semantic readiness remains in WorkflowEngine. */
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
        const ownerInstanceId = randomBytes(16).toString("hex");
        const promise = this.drive(jobId, ownerInstanceId, controller.signal)
            .catch((error) => {
            if (isAbort(error, controller.signal))
                return;
            this.engine.blockSchedulerFailure(jobId, error);
        })
            .finally(() => {
            const current = this.active.get(jobId);
            if (current?.promise === promise)
                this.active.delete(jobId);
        });
        this.active.set(jobId, { controller, promise, ownerInstanceId });
    }
    resumeActive() {
        if (this.disposed)
            return;
        for (const job of this.jobs.list())
            if (shouldResume(job))
                this.enqueue(job.jobId);
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
    async drive(jobId, ownerInstanceId, signal) {
        this.engine.reconcile(jobId, ownerInstanceId);
        while (!signal.aborted) {
            let job = this.engine.advance(jobId);
            if (workflowJobIsTerminal(job) ||
                job.graph.lifecycle === "BLOCKED" ||
                job.graph.lifecycle === "WAITING_USER") {
                return;
            }
            const runnable = this.engine.runnableNodeIds(jobId);
            if (runnable.length > 0) {
                await Promise.all(runnable.map((nodeId) => this.engine.executeNode(jobId, nodeId, ownerInstanceId, signal)));
                continue;
            }
            job = this.engine.reconcile(jobId, ownerInstanceId);
            if (workflowJobIsTerminal(job) ||
                job.graph.lifecycle === "BLOCKED" ||
                job.graph.lifecycle === "WAITING_USER") {
                return;
            }
            if (this.engine.runnableNodeIds(jobId).length > 0)
                continue;
            const notBefore = this.engine.nextRecoveryAt(jobId);
            if (notBefore !== undefined) {
                await delay(Math.max(1, Date.parse(notBefore) - Date.now()), signal);
                continue;
            }
            throw new Error(`no READY or scheduled recovery node exists while workflow is ${job.graph.lifecycle}`);
        }
    }
}
//# sourceMappingURL=driver.js.map