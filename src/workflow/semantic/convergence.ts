import type { WorkflowCriterionAssessmentRequirement } from "#internet/workflow/semantic/assessment";
import { criterionAssessmentIsCurrent } from "#internet/workflow/semantic/assessment";
import type {
	WorkflowAssessmentSubject,
	WorkflowCriterionAssessmentPayload,
	WorkflowFindingPayload,
	WorkflowPlanTaskExecutionState,
	WorkflowPlanTaskRef,
} from "#internet/workflow/semantic/types";

export interface WorkflowConvergenceAssessmentState {
	readonly artifactId: string;
	readonly current: boolean;
	readonly assessment: WorkflowCriterionAssessmentPayload;
}

export interface WorkflowConvergenceArtifactState {
	readonly artifactId: string;
	readonly type: string;
	readonly current: boolean;
}

export interface WorkflowConvergenceFindingState {
	readonly finding: WorkflowFindingPayload;
	readonly resolved: boolean;
}

export interface WorkflowConvergenceAuthorityRequirement {
	readonly id: string;
	readonly subject: WorkflowAssessmentSubject;
}

export interface WorkflowConvergenceGateState extends WorkflowConvergenceAuthorityRequirement {
	readonly resolved: boolean;
}

export interface WorkflowConvergenceDependencyState {
	readonly id: string;
	readonly resolved: boolean;
}

export interface WorkflowConvergencePolicy {
	readonly criteria: readonly WorkflowCriterionAssessmentRequirement[];
	readonly requiredDeliverableTypes: readonly string[];
	readonly requiredAuthorityGates: readonly WorkflowConvergenceAuthorityRequirement[];
	readonly requiredReceiptIds: readonly string[];
	readonly requiredDependencyIds: readonly string[];
	readonly requiredPlanTasks?: readonly WorkflowPlanTaskRef[];
}

export interface WorkflowConvergenceState {
	readonly assessments: readonly WorkflowConvergenceAssessmentState[];
	readonly findings: readonly WorkflowConvergenceFindingState[];
	readonly deliverables: readonly WorkflowConvergenceArtifactState[];
	readonly authorityGates: readonly WorkflowConvergenceGateState[];
	readonly receiptIds: readonly string[];
	readonly dependencies: readonly WorkflowConvergenceDependencyState[];
	readonly planTasks: readonly WorkflowPlanTaskExecutionState[];
}

export const WORKFLOW_CONVERGENCE_BLOCKER_KINDS = [
	"criterion",
	"finding",
	"deliverable",
	"authority",
	"receipt",
	"dependency",
	"plan_task",
] as const;
export type WorkflowConvergenceBlockerKind = (typeof WORKFLOW_CONVERGENCE_BLOCKER_KINDS)[number];

export interface WorkflowConvergenceBlocker {
	readonly kind: WorkflowConvergenceBlockerKind;
	readonly id: string;
	readonly reason: string;
}

export interface WorkflowConvergenceResult {
	readonly converged: boolean;
	readonly blockers: readonly WorkflowConvergenceBlocker[];
}

function unique(values: readonly string[]): readonly string[] {
	return [...new Set(values)];
}

function sameSubject(left: WorkflowAssessmentSubject, right: WorkflowAssessmentSubject): boolean {
	return left.kind === right.kind && left.id === right.id && left.version === right.version;
}

function planTaskKey(task: WorkflowPlanTaskRef): string {
	return `${task.planArtifact.runId}:${task.planArtifact.artifactId}:${task.taskId}`;
}

function criterionKey(requirement: WorkflowCriterionAssessmentRequirement): string {
	return `${requirement.criterion.criteriaArtifact.artifactId}:${requirement.criterion.criterionId}@${requirement.criterion.criterionVersion}`;
}

function authorityKey(requirement: WorkflowConvergenceAuthorityRequirement): string {
	return `${requirement.id}:${requirement.subject.kind}:${requirement.subject.id}@${requirement.subject.version}`;
}

function assessCriterion(
	requirement: WorkflowCriterionAssessmentRequirement,
	assessmentStates: readonly WorkflowConvergenceAssessmentState[],
): WorkflowConvergenceBlocker | undefined {
	const current = assessmentStates
		.filter((state) => state.current)
		.map((state) => state.assessment)
		.filter((assessment) => criterionAssessmentIsCurrent(assessment, requirement));
	for (const method of requirement.requiredMethods) {
		const methodAssessments = current.filter((assessment) => assessment.method === method);
		if (methodAssessments.length === 0) {
			return {
				kind: "criterion",
				id: criterionKey(requirement),
				reason: `missing current ${method} assessment`,
			};
		}
		if (methodAssessments.some((assessment) => assessment.verdict !== "SATISFIED")) {
			return {
				kind: "criterion",
				id: criterionKey(requirement),
				reason: `current ${method} assessment is not satisfied`,
			};
		}
	}
	return undefined;
}

export function evaluateWorkflowConvergence(
	policy: WorkflowConvergencePolicy,
	state: WorkflowConvergenceState,
): WorkflowConvergenceResult {
	const blockers: WorkflowConvergenceBlocker[] = [];
	for (const requirement of policy.criteria) {
		const blocker = assessCriterion(requirement, state.assessments);
		if (blocker !== undefined) blockers.push(blocker);
	}
	for (const finding of state.findings) {
		if (!finding.resolved && finding.finding.severity === "blocking") {
			blockers.push({ kind: "finding", id: finding.finding.findingId, reason: "blocking Finding is unresolved" });
		}
	}
	for (const type of unique(policy.requiredDeliverableTypes)) {
		if (!state.deliverables.some((artifact) => artifact.current && artifact.type === type)) {
			blockers.push({ kind: "deliverable", id: type, reason: "required current deliverable is missing" });
		}
	}
	for (const requirement of policy.requiredAuthorityGates) {
		if (
			!state.authorityGates.some(
				(gate) => gate.id === requirement.id && sameSubject(gate.subject, requirement.subject) && gate.resolved,
			)
		) {
			blockers.push({
				kind: "authority",
				id: authorityKey(requirement),
				reason: "required authority gate is unresolved for the exact current subject",
			});
		}
	}
	const receipts = new Set(state.receiptIds);
	for (const id of unique(policy.requiredReceiptIds)) {
		if (!receipts.has(id)) blockers.push({ kind: "receipt", id, reason: "required deterministic receipt is missing" });
	}
	for (const id of unique(policy.requiredDependencyIds)) {
		if (!state.dependencies.some((dependency) => dependency.id === id && dependency.resolved)) {
			blockers.push({ kind: "dependency", id, reason: "required dependency is unresolved" });
		}
	}
	const requiredPlanTasks = new Map((policy.requiredPlanTasks ?? []).map((task) => [planTaskKey(task), task]));
	for (const [id, requiredTask] of requiredPlanTasks) {
		if (
			!state.planTasks.some(
				(task) =>
					task.completed &&
					task.taskId === requiredTask.taskId &&
					task.planArtifact.runId === requiredTask.planArtifact.runId &&
					task.planArtifact.artifactId === requiredTask.planArtifact.artifactId,
			)
		)
			blockers.push({ kind: "plan_task", id, reason: "required PlanTask execution is incomplete" });
	}
	return { converged: blockers.length === 0, blockers };
}
