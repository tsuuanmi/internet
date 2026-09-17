import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import type { WorkflowArtifact, WorkflowArtifactLineage, WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import { type WorkflowSemanticArtifactType, type WorkflowSemanticPayload } from "#internet/workflow/semantic/types";
export interface WorkflowSemanticArtifactDraft {
    readonly type: WorkflowSemanticArtifactType;
    readonly payload: WorkflowSemanticPayload;
    readonly lineage?: readonly WorkflowArtifactLineage[];
}
export interface WorkflowSemanticExecutionResult {
    readonly executionId: string;
    readonly workItemId: string;
    readonly inputBundleId: string;
    readonly artifacts: readonly WorkflowSemanticArtifactDraft[];
    readonly receiptIds: readonly string[];
}
export interface WorkflowSemanticPromotionContext {
    readonly workItem: WorkflowWorkItem;
    readonly inputBundle: WorkflowInputBundle;
    readonly capability: WorkflowCapabilityDescriptor;
    readonly artifactStore: WorkflowArtifactStore;
}
export declare function parseWorkflowSemanticExecutionResult(value: unknown): WorkflowSemanticExecutionResult;
export declare function promoteWorkflowSemanticResult(context: WorkflowSemanticPromotionContext, resultValue: unknown): readonly WorkflowArtifact[];
//# sourceMappingURL=promotion.d.ts.map