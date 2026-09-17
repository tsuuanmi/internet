import { describe, expect, it } from "vitest";
import {
	assertCriterionRevisionAuthority,
	parseWorkflowAcceptanceCriteriaPayload,
	parseWorkflowNeedPayload,
	parseWorkflowPlanPayload,
	requiredCriterionRevisionAuthority,
} from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);
const objectiveArtifact = { runId, artifactId: "a".repeat(64) };
const criteriaArtifact = { runId, artifactId: "b".repeat(64) };

const userCriterion = {
	criterionId: "ac-1",
	version: "1",
	statement: "Preserve the explicit User constraint",
	provenance: "user" as const,
	required: true,
	assessmentPolicy: { requiredMethods: ["reviewer" as const] },
};

describe("workflow semantic validation", () => {
	it("validates acceptance criteria provenance and assessment policy", () => {
		const payload = parseWorkflowAcceptanceCriteriaPayload({
			criteriaSetId: "criteria-1",
			version: "1",
			objective: objectiveArtifact,
			criteria: [userCriterion],
		});
		expect(payload.criteria[0]?.provenance).toBe("user");
		expect(payload.criteria[0]?.assessmentPolicy.requiredMethods).toEqual(["reviewer"]);
	});

	it("rejects plan dependencies that are not declared tasks", () => {
		expect(() =>
			parseWorkflowPlanPayload({
				planId: "plan-1",
				version: "1",
				objective: objectiveArtifact,
				acceptanceCriteria: criteriaArtifact,
				tasks: [
					{
						taskId: "task-1",
						title: "Implement",
						description: "Implement the requested change",
						dependsOn: ["missing-task"],
						criterionIds: ["ac-1"],
						needIds: ["need-1"],
					},
				],
				assumptions: [],
				risks: [],
			}),
		).toThrow("unknown dependency");
	});

	it("rejects Need types outside the registered semantic vocabulary", () => {
		expect(() =>
			parseWorkflowNeedPayload({
				needId: "need-1",
				type: "ad_hoc",
				requestOwner: { kind: "plan_task", id: "task-1" },
				question: "Do work",
				subjects: [],
				relatedArtifacts: [],
			}),
		).toThrow("invalid workflow Need type");
	});

	it("requires explicit dependency changes in Plan revision metadata", () => {
		expect(() =>
			parseWorkflowPlanPayload({
				planId: "plan-1",
				version: "2",
				objective: objectiveArtifact,
				acceptanceCriteria: criteriaArtifact,
				tasks: [],
				assumptions: [],
				risks: [],
				supersedes: { runId, artifactId: "c".repeat(64) },
				revision: {
					reason: "Dependency graph changed",
					addedTaskIds: [],
					removedTaskIds: [],
					changedTaskIds: [],
					changedAssumptionIds: [],
					affectedRefs: [],
				},
			}),
		).toThrow("changed dependency task id");
	});

	it("requires the authority that owns an existing criterion before revision", () => {
		expect(requiredCriterionRevisionAuthority(userCriterion)).toBe("user");
		const revised = { ...userCriterion, version: "2", statement: "Changed constraint" };
		expect(() => assertCriterionRevisionAuthority(userCriterion, revised, "planner")).toThrow(
			"requires user authority",
		);
		expect(() => assertCriterionRevisionAuthority(userCriterion, revised, "user")).not.toThrow();
	});
});
