import type { WorkflowArtifactRef, WorkflowEntityRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";
export declare const WORKFLOW_SEMANTIC_ARTIFACT_TYPES: {
    readonly objective: "objective";
    readonly acceptanceCriteria: "acceptance_criteria";
    readonly plan: "plan";
    readonly need: "need";
    readonly finding: "finding";
    readonly evidence: "evidence";
    readonly criterionAssessment: "criterion_assessment";
    readonly report: "report";
    readonly delivery: "delivery";
    readonly userFeedback: "user_feedback";
};
export type WorkflowSemanticArtifactType = (typeof WORKFLOW_SEMANTIC_ARTIFACT_TYPES)[keyof typeof WORKFLOW_SEMANTIC_ARTIFACT_TYPES];
export declare const WORKFLOW_SEMANTIC_SCHEMA_VERSION: "1";
export declare const WORKFLOW_SEMANTIC_SCHEMA_REFS: {
    readonly objective: {
        readonly id: "workflow.objective";
        readonly version: "1";
    };
    readonly acceptanceCriteria: {
        readonly id: "workflow.acceptance-criteria";
        readonly version: "1";
    };
    readonly plan: {
        readonly id: "workflow.plan";
        readonly version: "1";
    };
    readonly need: {
        readonly id: "workflow.need";
        readonly version: "1";
    };
    readonly finding: {
        readonly id: "workflow.finding";
        readonly version: "1";
    };
    readonly evidence: {
        readonly id: "workflow.evidence";
        readonly version: "1";
    };
    readonly criterionAssessment: {
        readonly id: "workflow.criterion-assessment";
        readonly version: "1";
    };
    readonly report: {
        readonly id: "workflow.report";
        readonly version: "1";
    };
    readonly delivery: {
        readonly id: "workflow.delivery";
        readonly version: "1";
    };
    readonly userFeedback: {
        readonly id: "workflow.user-feedback";
        readonly version: "1";
    };
};
export declare const WORKFLOW_CRITERION_PROVENANCE: readonly ["user", "policy", "planner_derived"];
export type WorkflowCriterionProvenance = (typeof WORKFLOW_CRITERION_PROVENANCE)[number];
export declare const WORKFLOW_REQUIREMENT_REVISION_AUTHORITIES: readonly ["user", "policy", "planner"];
export type WorkflowRequirementRevisionAuthority = (typeof WORKFLOW_REQUIREMENT_REVISION_AUTHORITIES)[number];
export declare const WORKFLOW_ASSESSMENT_METHODS: readonly ["deterministic", "reviewer", "user"];
export type WorkflowAssessmentMethod = (typeof WORKFLOW_ASSESSMENT_METHODS)[number];
export declare const WORKFLOW_ASSESSMENT_VERDICTS: readonly ["SATISFIED", "UNSATISFIED", "INCONCLUSIVE"];
export type WorkflowAssessmentVerdict = (typeof WORKFLOW_ASSESSMENT_VERDICTS)[number];
export declare const WORKFLOW_NEED_TYPES: readonly ["planning", "execution", "plan_change", "requirements_change", "clarification"];
export type WorkflowNeedType = (typeof WORKFLOW_NEED_TYPES)[number];
export declare const WORKFLOW_FINDING_SEVERITIES: readonly ["info", "warning", "blocking"];
export type WorkflowFindingSeverity = (typeof WORKFLOW_FINDING_SEVERITIES)[number];
export declare const WORKFLOW_FEEDBACK_PROVENANCE: readonly ["user_explicit", "local_agent", "system_observed"];
export type WorkflowFeedbackProvenance = (typeof WORKFLOW_FEEDBACK_PROVENANCE)[number];
export interface WorkflowObjectiveConstraint {
    readonly id: string;
    readonly statement: string;
    readonly provenance: WorkflowCriterionProvenance;
}
export interface WorkflowObjectivePayload {
    readonly objectiveId: string;
    readonly version: string;
    readonly admissionId: string;
    readonly statement: string;
    readonly constraints: readonly WorkflowObjectiveConstraint[];
    readonly supersedes?: WorkflowArtifactRef;
}
export interface WorkflowCriterionAssessmentPolicy {
    readonly requiredMethods: readonly WorkflowAssessmentMethod[];
}
export interface WorkflowAcceptanceCriterion {
    readonly criterionId: string;
    readonly version: string;
    readonly statement: string;
    readonly provenance: WorkflowCriterionProvenance;
    readonly required: boolean;
    readonly assessmentPolicy: WorkflowCriterionAssessmentPolicy;
}
export interface WorkflowAcceptanceCriteriaPayload {
    readonly criteriaSetId: string;
    readonly version: string;
    readonly objective: WorkflowArtifactRef;
    readonly criteria: readonly WorkflowAcceptanceCriterion[];
    readonly supersedes?: WorkflowArtifactRef;
}
export interface WorkflowPlanAssumption {
    readonly assumptionId: string;
    readonly statement: string;
}
export interface WorkflowPlanTask {
    readonly taskId: string;
    readonly title: string;
    readonly description: string;
    readonly dependsOn: readonly string[];
    readonly parentTaskId?: string;
    readonly criterionIds: readonly string[];
    readonly needIds: readonly string[];
}
export interface WorkflowPlanRevision {
    readonly reason: string;
    readonly addedTaskIds: readonly string[];
    readonly removedTaskIds: readonly string[];
    readonly changedTaskIds: readonly string[];
    readonly changedDependencyTaskIds: readonly string[];
    readonly changedAssumptionIds: readonly string[];
    readonly affectedRefs: readonly WorkflowEntityRef[];
}
export interface WorkflowPlanPayload {
    readonly planId: string;
    readonly version: string;
    readonly objective: WorkflowArtifactRef;
    readonly acceptanceCriteria: WorkflowArtifactRef;
    readonly tasks: readonly WorkflowPlanTask[];
    readonly assumptions: readonly WorkflowPlanAssumption[];
    readonly risks: readonly string[];
    readonly supersedes?: WorkflowArtifactRef;
    readonly revision?: WorkflowPlanRevision;
}
export interface WorkflowNeedPayload {
    readonly needId: string;
    readonly type: WorkflowNeedType;
    readonly requestOwner: WorkflowEntityRef;
    readonly requestedCapability?: string;
    readonly question: string;
    readonly subjects: readonly WorkflowEntityRef[];
    readonly relatedArtifacts: readonly WorkflowArtifactRef[];
}
export interface WorkflowFindingPayload {
    readonly findingId: string;
    readonly severity: WorkflowFindingSeverity;
    readonly summary: string;
    readonly details?: string;
    readonly subjects: readonly WorkflowEntityRef[];
    readonly relatedArtifacts: readonly WorkflowArtifactRef[];
    readonly needIds: readonly string[];
}
export interface WorkflowEvidencePayload {
    readonly evidenceId: string;
    readonly summary: string;
    readonly subjects: readonly WorkflowEntityRef[];
    readonly sourceRefs: readonly WorkflowEntityRef[];
    readonly relatedArtifacts: readonly WorkflowArtifactRef[];
}
export interface WorkflowCriterionRef {
    readonly criteriaArtifact: WorkflowArtifactRef;
    readonly criterionId: string;
    readonly criterionVersion: string;
}
export interface WorkflowAssessmentSubject extends WorkflowEntityRef {
    readonly version: string;
}
export interface WorkflowCriterionAssessmentPayload {
    readonly criterion: WorkflowCriterionRef;
    readonly subject: WorkflowAssessmentSubject;
    readonly method: WorkflowAssessmentMethod;
    readonly verdict: WorkflowAssessmentVerdict;
    readonly policyRef: WorkflowVersionRef;
    readonly inputBundleId?: string;
    readonly evidence: readonly WorkflowArtifactRef[];
    readonly findingIds: readonly string[];
}
export interface WorkflowReportPayload {
    readonly reportId: string;
    readonly title: string;
    readonly body: string;
    readonly evidence: readonly WorkflowArtifactRef[];
}
export interface WorkflowDeliveryPayload {
    readonly deliveryId: string;
    readonly kind: string;
    readonly subject: WorkflowAssessmentSubject;
    readonly artifacts: readonly WorkflowArtifactRef[];
    readonly instructions?: string;
    readonly supersedes?: WorkflowArtifactRef;
}
export interface WorkflowUserFeedbackPayload {
    readonly feedbackId: string;
    readonly provenance: WorkflowFeedbackProvenance;
    readonly raw: string;
    readonly targetDelivery?: WorkflowArtifactRef;
    readonly targetVersion?: string;
    readonly attachments: readonly WorkflowArtifactRef[];
}
export type WorkflowSemanticPayload = WorkflowObjectivePayload | WorkflowAcceptanceCriteriaPayload | WorkflowPlanPayload | WorkflowNeedPayload | WorkflowFindingPayload | WorkflowEvidencePayload | WorkflowCriterionAssessmentPayload | WorkflowReportPayload | WorkflowDeliveryPayload | WorkflowUserFeedbackPayload;
export interface WorkflowPlanTaskRef {
    readonly planArtifact: WorkflowArtifactRef;
    readonly taskId: string;
}
export interface WorkflowPlanTaskExecutionState extends WorkflowPlanTaskRef {
    readonly completed: boolean;
}
//# sourceMappingURL=types.d.ts.map