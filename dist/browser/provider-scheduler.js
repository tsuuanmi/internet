import { InternetError } from "#internet/core/errors";
/**
 * Bounded provider scheduler. Different sessions may occupy the configured
 * capacity, while each native conversation session remains strictly ordered.
 * A queued exclusive lifecycle job is a FIFO fence: earlier turns drain, then
 * the exclusive work runs before any later turn begins.
 */
export class ProviderScheduler {
    constructor(capacity) {
        this.queue = [];
        this.activeSessions = new Set();
        this.activeJobs = new Set();
        this.idleWaiters = new Set();
        this.active = 0;
        this.exclusive = false;
        this.generation = 0;
        if (!Number.isInteger(capacity) || capacity < 1)
            throw new Error("provider scheduler capacity must be a positive integer");
        this.capacity = capacity;
    }
    get isIdle() {
        return this.active === 0 && this.queue.length === 0;
    }
    currentGeneration() {
        return this.generation;
    }
    isCurrent(lease) {
        return this.closed === undefined && lease.generation === this.generation && !lease.signal.aborted;
    }
    /** Invalidate all leases, reject queued work, and abort active work. */
    invalidate(reason) {
        this.generation += 1;
        this.rejectQueued(reason);
        this.abortActive(reason);
    }
    async waitForIdle() {
        if (this.isIdle)
            return;
        await new Promise((resolve) => this.idleWaiters.add(resolve));
    }
    close(reason = new InternetError("aborted", "provider scheduler closed")) {
        if (this.closed !== undefined)
            return;
        this.closed = reason;
        this.generation += 1;
        this.rejectQueued(reason);
        this.abortActive(reason);
    }
    runTurn(sessionId, signal, work) {
        if (sessionId.trim().length === 0)
            return Promise.reject(new Error("provider scheduler session id must not be empty"));
        return new Promise((resolve, reject) => {
            if (this.closed !== undefined) {
                reject(this.closed);
                return;
            }
            const job = { kind: "turn", sessionId, signal, work, resolve, reject };
            const abort = () => {
                const index = this.queue.indexOf(job);
                if (index < 0)
                    return;
                this.queue.splice(index, 1);
                reject(signal?.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"));
                this.notifyIdle();
                this.drive();
            };
            job.abort = abort;
            if (signal?.aborted) {
                reject(signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"));
                return;
            }
            signal?.addEventListener("abort", abort, { once: true });
            this.queue.push(job);
            this.drive();
        });
    }
    runExclusive(work, signal) {
        return new Promise((resolve, reject) => {
            if (this.closed !== undefined) {
                reject(this.closed);
                return;
            }
            if (signal?.aborted) {
                reject(signal.reason instanceof Error
                    ? signal.reason
                    : new InternetError("aborted", "browser operation aborted"));
                return;
            }
            const job = { kind: "exclusive", signal, work, resolve, reject };
            const abort = () => {
                const index = this.queue.indexOf(job);
                if (index < 0)
                    return;
                this.queue.splice(index, 1);
                reject(signal?.reason instanceof Error
                    ? signal.reason
                    : new InternetError("aborted", "browser operation aborted"));
                this.notifyIdle();
                this.drive();
            };
            job.abort = abort;
            signal?.addEventListener("abort", abort, { once: true });
            this.queue.push(job);
            this.drive();
        });
    }
    drive() {
        if (this.exclusive)
            return;
        if (this.closed !== undefined) {
            this.notifyIdle();
            return;
        }
        for (;;) {
            const next = this.nextRunnable();
            if (next === undefined) {
                this.notifyIdle();
                return;
            }
            this.queue.splice(next.index, 1);
            this.start(next.job);
            if (next.job.kind === "exclusive")
                return;
        }
    }
    nextRunnable() {
        if (this.active >= this.capacity)
            return undefined;
        const exclusiveFence = this.queue.findIndex((job) => job.kind === "exclusive");
        const limit = exclusiveFence < 0 ? this.queue.length : exclusiveFence;
        for (let index = 0; index < limit; index += 1) {
            const job = this.queue[index];
            if (job?.kind === "turn" && !this.activeSessions.has(job.sessionId))
                return { index, job };
        }
        if (exclusiveFence === 0 && this.active === 0) {
            const job = this.queue[0];
            if (job !== undefined)
                return { index: 0, job };
        }
        return undefined;
    }
    start(job) {
        const controller = new AbortController();
        const active = { controller };
        job.signal?.removeEventListener("abort", job.abort);
        active.externalAbort = () => controller.abort(job.signal?.reason);
        job.signal?.addEventListener("abort", active.externalAbort, { once: true });
        if (job.kind === "turn")
            this.activeSessions.add(job.sessionId);
        else
            this.exclusive = true;
        const lease = { generation: this.generation, signal: controller.signal };
        this.active += 1;
        this.activeJobs.add(active);
        void job
            .work(lease)
            .then(job.resolve, job.reject)
            .finally(() => {
            this.active -= 1;
            this.activeJobs.delete(active);
            job.signal?.removeEventListener("abort", active.externalAbort);
            if (job.kind === "turn")
                this.activeSessions.delete(job.sessionId);
            else
                this.exclusive = false;
            this.drive();
        });
    }
    abortActive(reason) {
        for (const active of this.activeJobs)
            active.controller.abort(reason);
    }
    rejectQueued(reason) {
        for (const job of this.queue.splice(0)) {
            job.signal?.removeEventListener("abort", job.abort);
            job.reject(reason);
        }
        this.notifyIdle();
    }
    notifyIdle() {
        if (!this.isIdle)
            return;
        for (const resolve of this.idleWaiters)
            resolve();
        this.idleWaiters.clear();
    }
}
//# sourceMappingURL=provider-scheduler.js.map