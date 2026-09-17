import { describe, expect, it } from "vitest";
import {
	criterionAssessmentIsCurrent,
	evaluateWorkflowConvergence,
	type WorkflowConvergencePolicy,
	type WorkflowConvergenceState,
	type WorkflowCriterionAssessmentPayload,
} from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);
const criteriaArtifact = { runId, artifactId: "a".repeat(64) };
const planArtifact = { runId, artifactId: "b".repeat(64) };
const requirement = {
	criterion: { criteriaArtifact, criterionId: "ac-1", criterionVersion: "1" },
	subject: { kind: "delivery", id: "delivery-1", version: "head-1" },
	requiredMethods: ["reviewer" as const],
	policyRef: { id: "software-review", version: "1" },
	inputBundleId: "c".repeat(64),
};

function assessment(verdict: WorkflowCriterionAssessmentPayload["verdict"], subjectVersion = "head-1") {
	return {
		criterion: requirement.criterion,
		subject: { ...requirement.subject, version: subjectVersion },
		method: "reviewer" as const,
		verdict,
		policyRef: requirement.policyRef,
		inputBundleId: requirement.inputBundleId,
		evidence: [],
		findingIds: [],
	};
}

const policy: WorkflowConvergencePolicy = {
	criteria: [requirement],
	requiredDeliverableTypes: ["delivery"],
	requiredAuthorityGates: ["merge-authority"],
	requiredReceiptIds: ["ci-pass"],
	requiredDependencyIds: ["review-work"],
	requiredPlanTasks: [{ planArtifact, taskId: "task-1" }],
};

function state(assessments: readonly WorkflowCriterionAssessmentPayload[]): WorkflowConvergenceState {
	return {
		assessments,
		findings: [],
		deliverables: [{ artifactId: "d".repeat(64), type: "delivery", current: true }],
		authorityGates: [{ id: "merge-authority", resolved: true }],
		receiptIds: ["ci-pass"],
		dependencies: [{ id: "review-work", resolved: true }],
		planTasks: [{ planArtifact, taskId: "task-1", completed: true }],
	};
}

describe("workflow semantic convergence", () => {
	it("does not confuse completed PlanTask execution with criterion satisfaction", () => {
		const result = evaluateWorkflowConvergence(policy, state([assessment("UNSATISFIED")]));
		expect(result.converged).toBe(false);
		expect(result.blockers).toContainEqual(
			expect.objectContaining({ kind: "criterion", reason: "current reviewer assessment is not satisfied" }),
		);
	});

	it("converges only when all baseline typed gates are current and satisfied", () => {
		expect(evaluateWorkflowConvergence(policy, state([assessment("SATISFIED")]))).toEqual({
			converged: true,
			blockers: [],
		});
	});

	it("treats an assessment for an obsolete exact subject as stale", () => {
		const stale = assessment("SATISFIED", "head-0");
		expect(criterionAssessmentIsCurrent(stale, requirement)).toBe(false);
		const result = evaluateWorkflowConvergence(policy, state([stale]));
		expect(result.converged).toBe(false);
		expect(result.blockers[0]).toEqual(expect.objectContaining({ kind: "criterion" }));
	});
});
