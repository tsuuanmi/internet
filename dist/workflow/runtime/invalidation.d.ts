import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowArtifact, WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export declare function currentWorkflowArtifactIds(artifacts: readonly WorkflowArtifact[], bundles?: readonly WorkflowInputBundle[]): ReadonlySet<string>;
export declare function workflowInputBundleIsCurrent(bundle: WorkflowInputBundle, artifacts: readonly WorkflowArtifact[], bundles?: readonly WorkflowInputBundle[]): boolean;
export declare function staleWorkflowWorkItems(workItems: readonly WorkflowWorkItem[], bundles: readonly WorkflowInputBundle[], artifacts: readonly WorkflowArtifact[]): readonly WorkflowWorkItem[];
export interface WorkflowInvalidationDependencies {
    readonly workItems: WorkflowWorkItemStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly executions: WorkflowExecutionStore;
}
export declare function applyWorkflowInvalidation(dependencies: WorkflowInvalidationDependencies, runId: string, artifacts: readonly WorkflowArtifact[], now: () => number): void;
//# sourceMappingURL=invalidation.d.ts.map