export class WorkflowDurableAwaitableRuntime {
    constructor(timers, events, hooks = {}) {
        this.timers = timers;
        this.events = events;
        this.hooks = hooks;
    }
    ensureTimer(runId, causedBy, contract, now) {
        const timer = this.timers.ensure(runId, causedBy, contract, now);
        this.hooks.onTimerChanged?.();
        return timer;
    }
    ensureExternalEventWait(runId, causedBy, contract, now) {
        const wait = this.events.ensureWait(runId, causedBy, contract, now);
        if (wait.state === "MATCHED")
            this.hooks.onRunWake?.(runId);
        return wait;
    }
    ingestExternalEvent(input, now) {
        const event = this.events.ingest(input, now);
        const matched = this.events.reconcile(input.runId, now);
        if (matched.length > 0)
            this.hooks.onRunWake?.(input.runId);
        return event;
    }
    listTimers(runId) {
        return this.timers.list(runId);
    }
    listExternalEventWaits(runId) {
        return this.events.listWaits(runId);
    }
    hasOpen(runId, needArtifactId) {
        return (this.timers
            .list(runId)
            .some((timer) => timer.causedBy.artifactId === needArtifactId && timer.state === "PENDING") ||
            this.events
                .listWaits(runId)
                .some((wait) => wait.causedBy.artifactId === needArtifactId && wait.state === "WAITING"));
    }
    reconcile(runId, now) {
        const fired = this.timers.reconcile(runId, now);
        const matched = this.events.reconcile(runId, now);
        if (fired.length > 0)
            this.hooks.onTimerChanged?.();
        if (fired.length > 0 || matched.length > 0)
            this.hooks.onRunWake?.(runId);
    }
}
//# sourceMappingURL=runtime.js.map