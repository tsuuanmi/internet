export class WorkflowDurablePendingActionRuntime {
    constructor(store, service) {
        this.store = store;
        this.service = service;
    }
    ensure(input) {
        return this.store.ensure(input);
    }
    list(runId) {
        return this.store.list(runId);
    }
    hasOpen(runId, needArtifactId) {
        return this.store.hasOpen(runId, needArtifactId);
    }
    reconcile(runId) {
        this.service.supersedeStale(runId);
    }
}
//# sourceMappingURL=runtime.js.map