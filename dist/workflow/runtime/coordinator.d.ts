import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import { type WorkflowExecutionManagerDependencies } from "#internet/workflow/runtime/execution-manager";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import type { WorkflowCapabilityExecutorRegistry, WorkflowExecution, WorkflowPendingActionMaterializer, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export interface WorkflowRunCoordinatorOptions {
    readonly leaseMs?: number;
    readonly now?: () => number;
}
export interface WorkflowRunCoordinatorDependencies extends WorkflowExecutionManagerDependencies {
    readonly runs: WorkflowRunStore;
    readonly artifacts: WorkflowArtifactStore;
    readonly workItems: WorkflowWorkItemStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly executions: WorkflowExecutionStore;
    readonly results: WorkflowExecutionResultStore;
    readonly capabilities: WorkflowCapabilityRegistry;
    readonly executors: WorkflowCapabilityExecutorRegistry;
    readonly pendingActions: WorkflowPendingActionMaterializer;
    readonly policy: WorkflowRuntimePolicy;
}
export declare class WorkflowRunCoordinator {
    private readonly dependencies;
    private readonly execution;
    private readonly now;
    constructor(dependencies: WorkflowRunCoordinatorDependencies, options?: WorkflowRunCoordinatorOptions);
    status(runId: string): WorkflowRun;
    advance(runId: string): WorkflowRun;
    runnableWorkItemIds(runId: string): readonly string[];
    reconcile(runId: string, signal?: AbortSignal): Promise<WorkflowRun>;
    heartbeat(runId: string, executionId: string, ownerInstanceId: string): WorkflowExecution;
    execute(runId: string, workItemId: string, ownerInstanceId: string, signal?: AbortSignal): Promise<WorkflowRun>;
}
//# sourceMappingURL=coordinator.d.ts.map