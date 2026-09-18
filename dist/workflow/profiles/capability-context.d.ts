import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowArtifact, WorkflowInputBundle } from "#internet/workflow/kernel/types";
export interface WorkflowExactCapabilityInput {
    readonly inputBundle: WorkflowInputBundle;
    readonly artifacts: readonly WorkflowArtifact[];
}
export declare function loadWorkflowExactCapabilityInput(store: WorkflowArtifactStore, inputBundle: WorkflowInputBundle): WorkflowExactCapabilityInput;
export declare function workflowCapabilityInputJson(input: WorkflowExactCapabilityInput): string;
//# sourceMappingURL=capability-context.d.ts.map