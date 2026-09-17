import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";
import type { WorkflowAssessmentMethod, WorkflowAssessmentSubject, WorkflowCriterionAssessmentPayload, WorkflowCriterionRef } from "#internet/workflow/semantic/types";
export interface WorkflowCriterionAssessmentRequirement {
    readonly criterion: WorkflowCriterionRef;
    readonly subject: WorkflowAssessmentSubject;
    readonly requiredMethods: readonly WorkflowAssessmentMethod[];
    readonly policyRef: WorkflowVersionRef;
    readonly inputBundleId?: string;
    readonly evidence?: readonly WorkflowArtifactRef[];
}
export declare function criterionAssessmentIsCurrent(assessment: WorkflowCriterionAssessmentPayload, requirement: WorkflowCriterionAssessmentRequirement): boolean;
//# sourceMappingURL=assessment.d.ts.map