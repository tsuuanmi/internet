import { canonicalJson } from "#internet/core/canonical-json";
import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";
import type {
	WorkflowAssessmentMethod,
	WorkflowAssessmentSubject,
	WorkflowCriterionAssessmentPayload,
	WorkflowCriterionRef,
} from "#internet/workflow/semantic/types";

export interface WorkflowCriterionAssessmentRequirement {
	readonly criterion: WorkflowCriterionRef;
	readonly subject: WorkflowAssessmentSubject;
	readonly requiredMethods: readonly WorkflowAssessmentMethod[];
	readonly policyRef: WorkflowVersionRef;
	readonly inputBundleId?: string;
	readonly evidence?: readonly WorkflowArtifactRef[];
}

function artifactRefKey(ref: WorkflowArtifactRef): string {
	return `${ref.runId}:${ref.artifactId}`;
}

function sameArtifactRefs(left: readonly WorkflowArtifactRef[], right: readonly WorkflowArtifactRef[]): boolean {
	const leftKeys = [...left].map(artifactRefKey).sort();
	const rightKeys = [...right].map(artifactRefKey).sort();
	return canonicalJson(leftKeys) === canonicalJson(rightKeys);
}

function sameVersionRef(left: WorkflowVersionRef, right: WorkflowVersionRef): boolean {
	return left.id === right.id && left.version === right.version;
}

export function criterionAssessmentIsCurrent(
	assessment: WorkflowCriterionAssessmentPayload,
	requirement: WorkflowCriterionAssessmentRequirement,
): boolean {
	if (
		assessment.criterion.criteriaArtifact.runId !== requirement.criterion.criteriaArtifact.runId ||
		assessment.criterion.criteriaArtifact.artifactId !== requirement.criterion.criteriaArtifact.artifactId ||
		assessment.criterion.criterionId !== requirement.criterion.criterionId ||
		assessment.criterion.criterionVersion !== requirement.criterion.criterionVersion
	)
		return false;
	if (
		assessment.subject.kind !== requirement.subject.kind ||
		assessment.subject.id !== requirement.subject.id ||
		assessment.subject.version !== requirement.subject.version
	)
		return false;
	if (!sameVersionRef(assessment.policyRef, requirement.policyRef)) return false;
	if (requirement.inputBundleId !== undefined && assessment.inputBundleId !== requirement.inputBundleId) return false;
	if (requirement.evidence !== undefined && !sameArtifactRefs(assessment.evidence, requirement.evidence)) return false;
	return requirement.requiredMethods.includes(assessment.method);
}
