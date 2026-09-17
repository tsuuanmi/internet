import type { WorkflowArtifact, WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";
export declare function currentWorkflowArtifactIds(artifacts: readonly WorkflowArtifact[], bundles?: readonly WorkflowInputBundle[]): ReadonlySet<string>;
export declare function workflowInputBundleIsCurrent(bundle: WorkflowInputBundle, artifacts: readonly WorkflowArtifact[], bundles?: readonly WorkflowInputBundle[]): boolean;
export declare function staleWorkflowWorkItems(workItems: readonly WorkflowWorkItem[], bundles: readonly WorkflowInputBundle[], artifacts: readonly WorkflowArtifact[]): readonly WorkflowWorkItem[];
//# sourceMappingURL=invalidation.d.ts.map