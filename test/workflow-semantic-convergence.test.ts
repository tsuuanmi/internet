import { describe, expect, it } from "vitest";
import {
	criterionAssessmentIsCurrent,
	evaluateWorkflowConvergence,
	type WorkflowConvergenceAssessmentState,
	type WorkflowConvergencePolicy,
	type WorkflowConvergenceState,
	type WorkflowCriterionAssessmentPayload,
} from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);
const criteriaArtifact = { runId, artifactId: "a".repeat(64) };
const planArtifact = { runId, artifactId: "b".repeat(64) };
const subject = { kind: "delivery", id: "delivery-1", version: "head-1" };
const requirement = {
	criterion: { criteriaArtifact, criterionId: "ac-1", criterionVersion: "1" },
	subject,
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

function assessmentState(
	verdict: WorkflowCriterionAssessmentPayload["verdict"],
	current = true,
	subjectVersion = "head-1",
): WorkflowConvergenceAssessmentState {
	return {
		artifactId: `${current ? "e" : "f"}`.repeat(64),
		current,
		assessment: assessment(verdict, subjectVersion),
	};
}

const policy: WorkflowConvergencePolicy = {
	criteria: [requirement],
	requiredDeliverableTypes: ["delivery"],
	requiredAuthorityGates: [{ id: "merge-authority", subject }],
	requiredReceiptIds: ["ci-pass"],
	requiredDependencyIds: ["review-work"],
	requiredPlanTasks: [{ planArtifact, taskId: "task-1" }],
};

function state(assessments: readonly WorkflowConvergenceAssessmentState[]): WorkflowConvergenceState {
	return {
		assessments,
		findings: [],
		deliverables: [{ artifactId: "d".repeat(64), type: "delivery", current: true }],
		authorityGates: [{ id: "merge-authority", subject, resolved: true }],
		receiptIds: ["ci-pass"],
		dependencies: [{ id: "review-work", resolved: true }],
		planTasks: [{ planArtifact, taskId: "task-1", completed: true }],
	};
}

describe("workflow semantic convergence", () => {
	it("does not confuse completed PlanTask execution with criterion satisfaction", () => {
		const result = evaluateWorkflowConvergence(policy, state([assessmentState("UNSATISFIED")]));
		expect(result.converged).toBe(false);
		expect(result.blockers).toContainEqual(
			expect.objectContaining({ kind: "criterion", reason: "current reviewer assessment is not satisfied" }),
		);
	});

	it("converges only when all baseline typed gates are current and satisfied", () => {
		expect(evaluateWorkflowConvergence(policy, state([assessmentState("SATISFIED")]))).toEqual({
			converged: true,
			blockers: [],
		});
	});

	it("ignores superseded assessment artifacts when evaluating the current criterion", () => {
		const result = evaluateWorkflowConvergence(
			policy,
			state([assessmentState("UNSATISFIED", false), assessmentState("SATISFIED", true)]),
		);
		expect(result).toEqual({ converged: true, blockers: [] });
	});

	it("treats an assessment for an obsolete exact subject as stale", () => {
		const stale = assessment("SATISFIED", "head-0");
		expect(criterionAssessmentIsCurrent(stale, requirement)).toBe(false);
		const result = evaluateWorkflowConvergence(policy, state([assessmentState("SATISFIED", true, "head-0")]));
		expect(result.converged).toBe(false);
		expect(result.blockers[0]).toEqual(expect.objectContaining({ kind: "criterion" }));
	});

	it("rejects authority resolved for an obsolete subject version", () => {
		const current = state([assessmentState("SATISFIED")]);
		const result = evaluateWorkflowConvergence(policy, {
			...current,
			authorityGates: [{ id: "merge-authority", subject: { ...subject, version: "head-0" }, resolved: true }],
		});
		expect(result.converged).toBe(false);
		expect(result.blockers).toContainEqual(
			expect.objectContaining({ kind: "authority", reason: expect.stringContaining("exact current subject") }),
		);
	});
});
