const MAX_TIMEOUT_MS = 2_147_000_000;
export class WorkflowWakeupScheduler {
    constructor(timers, events, runs, driver, options = {}) {
        this.disposed = false;
        this.timers = timers;
        this.events = events;
        this.runs = runs;
        this.driver = driver;
        this.now = options.now ?? Date.now;
        this.setTimer = options.setTimer ?? ((handler, delayMs) => setTimeout(handler, delayMs));
        this.clearTimer = options.clearTimer ?? clearTimeout;
    }
    start() {
        if (this.disposed)
            return;
        this.reconcileExternalEvents();
        this.reconcileOverdue();
        this.refresh();
    }
    refresh() {
        if (this.disposed)
            return;
        if (this.scheduled !== undefined) {
            this.clearTimer(this.scheduled);
            this.scheduled = undefined;
        }
        const pending = this.timers
            .listAll()
            .filter((timer) => timer.state === "PENDING")
            .filter((timer) => {
            const run = this.runs.get(timer.runId);
            return run !== undefined && !["COMPLETED", "CANCELLED"].includes(run.lifecycle);
        })
            .sort((left, right) => left.deadline.localeCompare(right.deadline) || left.timerId.localeCompare(right.timerId));
        const next = pending[0];
        if (next === undefined)
            return;
        const delayMs = Math.max(1, Math.min(MAX_TIMEOUT_MS, Date.parse(next.deadline) - this.now()));
        this.scheduled = this.setTimer(() => {
            this.scheduled = undefined;
            this.reconcileOverdue();
            this.refresh();
        }, delayMs);
    }
    dispose() {
        this.disposed = true;
        if (this.scheduled !== undefined) {
            this.clearTimer(this.scheduled);
            this.scheduled = undefined;
        }
    }
    reconcileExternalEvents() {
        for (const run of this.runs.list()) {
            if (["COMPLETED", "CANCELLED"].includes(run.lifecycle))
                continue;
            const matched = this.events.reconcile(run.runId, this.now);
            const hasMatched = this.events.listWaits(run.runId).some((wait) => wait.state === "MATCHED");
            if (matched.length > 0 || hasMatched)
                this.driver.enqueue(run.runId);
        }
    }
    reconcileOverdue() {
        const now = this.now;
        const runIds = new Set(this.timers
            .listAll()
            .filter((timer) => timer.state === "PENDING" && Date.parse(timer.deadline) <= now())
            .map((timer) => timer.runId));
        for (const runId of runIds) {
            const fired = this.timers.reconcile(runId, now);
            if (fired.length > 0)
                this.driver.enqueue(runId);
        }
    }
}
//# sourceMappingURL=wakeup-scheduler.js.map