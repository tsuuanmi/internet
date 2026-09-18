import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import { type WorkflowArtifact, type WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowAwaitableRuntime, WorkflowPendingActionRuntime, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export interface WorkflowSchedulerDependencies {
    readonly artifacts: WorkflowArtifactStore;
    readonly workItems: WorkflowWorkItemStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly capabilities: WorkflowCapabilityRegistry;
    readonly pendingActions: WorkflowPendingActionRuntime;
    readonly awaitables: WorkflowAwaitableRuntime;
    readonly policy: WorkflowRuntimePolicy;
}
export declare function materializeWorkflowNeeds(dependencies: WorkflowSchedulerDependencies, run: WorkflowRun, artifacts: readonly WorkflowArtifact[], now: () => number): void;
export declare function prepareWorkflowReadyWork(dependencies: WorkflowSchedulerDependencies, run: WorkflowRun, artifacts: readonly WorkflowArtifact[], now: () => number): void;
//# sourceMappingURL=scheduler.d.ts.map