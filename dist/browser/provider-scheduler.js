import { InternetError } from "#internet/core/errors";
/**
 * Bounded provider scheduler. Different sessions may occupy the configured
 * capacity, while each native conversation session remains strictly ordered.
 * Exclusive lifecycle work forms a FIFO barrier after earlier turns drain.
 */
export class ProviderScheduler {
    constructor(capacity) {
        this.queue = [];
        this.activeSessions = new Set();
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
        return this.closed === undefined && lease.generation === this.generation;
    }
    /** Invalidate leases and reject queued work without interrupting running work. */
    invalidate(reason) {
        this.generation += 1;
        this.rejectQueued(reason);
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
    runExclusive(work) {
        return new Promise((resolve, reject) => {
            if (this.closed !== undefined) {
                reject(this.closed);
                return;
            }
            this.queue.push({ kind: "exclusive", work, resolve, reject });
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
        for (let index = 0; index < this.queue.length; index += 1) {
            const job = this.queue[index];
            if (job === undefined)
                continue;
            if (job.kind === "exclusive")
                return this.active === 0 && index === 0 ? { index, job } : undefined;
            if (!this.activeSessions.has(job.sessionId))
                return { index, job };
        }
        return undefined;
    }
    start(job) {
        const lease = { generation: this.generation };
        this.active += 1;
        if (job.kind === "turn") {
            job.signal?.removeEventListener("abort", job.abort);
            this.activeSessions.add(job.sessionId);
        }
        else {
            this.exclusive = true;
        }
        void job
            .work(lease)
            .then(job.resolve, job.reject)
            .finally(() => {
            this.active -= 1;
            if (job.kind === "turn")
                this.activeSessions.delete(job.sessionId);
            else
                this.exclusive = false;
            this.drive();
        });
    }
    rejectQueued(reason) {
        for (const job of this.queue.splice(0)) {
            if (job.kind === "turn")
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