import type { WorkflowArtifactRef, WorkflowEntityRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";

export const WORKFLOW_SEMANTIC_ARTIFACT_TYPES = {
	objective: "objective",
	acceptanceCriteria: "acceptance_criteria",
	plan: "plan",
	need: "need",
	finding: "finding",
	evidence: "evidence",
	criterionAssessment: "criterion_assessment",
	report: "report",
	implementationOutput: "implementation_output",
	delivery: "delivery",
	userFeedback: "user_feedback",
} as const;
export type WorkflowSemanticArtifactType =
	(typeof WORKFLOW_SEMANTIC_ARTIFACT_TYPES)[keyof typeof WORKFLOW_SEMANTIC_ARTIFACT_TYPES];

export const WORKFLOW_SEMANTIC_SCHEMA_VERSION = "1" as const;

export const WORKFLOW_SEMANTIC_SCHEMA_REFS = {
	objective: { id: "workflow.objective", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	acceptanceCriteria: { id: "workflow.acceptance-criteria", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	plan: { id: "workflow.plan", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	need: { id: "workflow.need", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	finding: { id: "workflow.finding", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	evidence: { id: "workflow.evidence", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	criterionAssessment: { id: "workflow.criterion-assessment", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	report: { id: "workflow.report", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	implementationOutput: { id: "workflow.implementation-output", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	delivery: { id: "workflow.delivery", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
	userFeedback: { id: "workflow.user-feedback", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
} as const satisfies Readonly<Record<keyof typeof WORKFLOW_SEMANTIC_ARTIFACT_TYPES, WorkflowVersionRef>>;

export const WORKFLOW_CRITERION_PROVENANCE = ["user", "policy", "planner_derived"] as const;
export type WorkflowCriterionProvenance = (typeof WORKFLOW_CRITERION_PROVENANCE)[number];

export const WORKFLOW_REQUIREMENT_REVISION_AUTHORITIES = ["user", "policy", "planner"] as const;
export type WorkflowRequirementRevisionAuthority = (typeof WORKFLOW_REQUIREMENT_REVISION_AUTHORITIES)[number];

export const WORKFLOW_ASSESSMENT_METHODS = ["deterministic", "reviewer", "user"] as const;
export type WorkflowAssessmentMethod = (typeof WORKFLOW_ASSESSMENT_METHODS)[number];

export const WORKFLOW_ASSESSMENT_VERDICTS = ["SATISFIED", "UNSATISFIED", "INCONCLUSIVE"] as const;
export type WorkflowAssessmentVerdict = (typeof WORKFLOW_ASSESSMENT_VERDICTS)[number];

export const WORKFLOW_NEED_TYPES = [
	"planning",
	"execution",
	"plan_change",
	"requirements_change",
	"clarification",
] as const;
export type WorkflowNeedType = (typeof WORKFLOW_NEED_TYPES)[number];

export const WORKFLOW_FINDING_SEVERITIES = ["info", "warning", "blocking"] as const;
export type WorkflowFindingSeverity = (typeof WORKFLOW_FINDING_SEVERITIES)[number];

export const WORKFLOW_FEEDBACK_PROVENANCE = ["user_explicit", "local_agent", "system_observed"] as const;
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

export interface WorkflowImplementationOutputPayload {
	readonly outputId: string;
	readonly kind: string;
	readonly subject: WorkflowAssessmentSubject;
	readonly artifacts: readonly WorkflowArtifactRef[];
	readonly instructions?: string;
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

export type WorkflowSemanticPayload =
	| WorkflowObjectivePayload
	| WorkflowAcceptanceCriteriaPayload
	| WorkflowPlanPayload
	| WorkflowNeedPayload
	| WorkflowFindingPayload
	| WorkflowEvidencePayload
	| WorkflowCriterionAssessmentPayload
	| WorkflowReportPayload
	| WorkflowImplementationOutputPayload
	| WorkflowDeliveryPayload
	| WorkflowUserFeedbackPayload;

export interface WorkflowPlanTaskRef {
	readonly planArtifact: WorkflowArtifactRef;
	readonly taskId: string;
}

export interface WorkflowPlanTaskExecutionState extends WorkflowPlanTaskRef {
	readonly completed: boolean;
}
