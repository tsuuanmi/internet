import { WorkflowExecutionManager, } from "#internet/workflow/runtime/execution-manager";
import { applyWorkflowInvalidation } from "#internet/workflow/runtime/invalidation";
import { projectWorkflowRunLifecycle } from "#internet/workflow/runtime/lifecycle";
import { materializeWorkflowNeeds, prepareWorkflowReadyWork } from "#internet/workflow/runtime/scheduler";
const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);
export class WorkflowRunCoordinator {
    constructor(dependencies, options = {}) {
        const leaseMs = options.leaseMs ?? 5 * 60_000;
        if (!Number.isSafeInteger(leaseMs) || leaseMs < 1)
            throw new Error("workflow execution lease must be positive");
        this.dependencies = dependencies;
        this.now = options.now ?? Date.now;
        this.execution = new WorkflowExecutionManager(dependencies, { leaseMs, now: this.now });
    }
    status(runId) {
        const run = this.dependencies.runs.get(runId);
        if (run === undefined)
            throw new Error(`workflow run ${runId} does not exist`);
        return run;
    }
    advance(runId) {
        let run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            return run;
        const artifacts = this.dependencies.artifacts.list(runId);
        applyWorkflowInvalidation(this.dependencies, runId, artifacts, this.now);
        materializeWorkflowNeeds(this.dependencies, run, artifacts, this.now);
        prepareWorkflowReadyWork(this.dependencies, run, artifacts, this.now);
        run = this.status(runId);
        return projectWorkflowRunLifecycle(this.dependencies, run, this.now);
    }
    runnableWorkItemIds(runId) {
        return this.dependencies.workItems
            .list(runId)
            .filter((item) => item.state === "READY")
            .map((item) => item.workItemId)
            .sort();
    }
    async reconcile(runId, signal) {
        const run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            return run;
        await this.execution.reconcile(runId, signal);
        return this.advance(runId);
    }
    heartbeat(runId, executionId, ownerInstanceId) {
        return this.execution.heartbeat(runId, executionId, ownerInstanceId);
    }
    async execute(runId, workItemId, ownerInstanceId, signal) {
        const run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            throw new Error("terminal workflow run cannot execute work");
        await this.execution.execute(run, workItemId, ownerInstanceId, signal);
        return this.advance(runId);
    }
}
//# sourceMappingURL=coordinator.js.map