import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowAwaitableRuntime, WorkflowPendingActionRuntime, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export interface WorkflowLifecycleDependencies {
    readonly runs: WorkflowRunStore;
    readonly artifacts: WorkflowArtifactStore;
    readonly workItems: WorkflowWorkItemStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly pendingActions: WorkflowPendingActionRuntime;
    readonly awaitables: WorkflowAwaitableRuntime;
    readonly policy: WorkflowRuntimePolicy;
}
export declare function projectWorkflowRunLifecycle(dependencies: WorkflowLifecycleDependencies, run: WorkflowRun, now: () => number): WorkflowRun;
//# sourceMappingURL=lifecycle.d.ts.map