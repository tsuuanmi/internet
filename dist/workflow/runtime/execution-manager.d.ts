import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import type { WorkflowCapabilityExecutorRegistry, WorkflowExecution } from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export interface WorkflowExecutionManagerDependencies {
    readonly runs: WorkflowRunStore;
    readonly artifacts: WorkflowArtifactStore;
    readonly workItems: WorkflowWorkItemStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly executions: WorkflowExecutionStore;
    readonly results: WorkflowExecutionResultStore;
    readonly capabilities: WorkflowCapabilityRegistry;
    readonly executors: WorkflowCapabilityExecutorRegistry;
}
export interface WorkflowExecutionManagerOptions {
    readonly leaseMs: number;
    readonly now: () => number;
}
export declare class WorkflowExecutionManager {
    private readonly dependencies;
    private readonly leaseMs;
    private readonly now;
    constructor(dependencies: WorkflowExecutionManagerDependencies, options: WorkflowExecutionManagerOptions);
    heartbeat(runId: string, executionId: string, ownerInstanceId: string): WorkflowExecution;
    reconcile(runId: string, signal?: AbortSignal): Promise<void>;
    execute(run: WorkflowRun, workItemId: string, ownerInstanceId: string, signal?: AbortSignal): Promise<void>;
    private commitResult;
    private reconcileExpiredExecution;
}
//# sourceMappingURL=execution-manager.d.ts.map