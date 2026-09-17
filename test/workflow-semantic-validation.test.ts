import { describe, expect, it } from "vitest";
import {
	assertCriterionRevisionAuthority,
	parseWorkflowAcceptanceCriteriaPayload,
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

	it("requires the authority that owns an existing criterion before revision", () => {
		expect(requiredCriterionRevisionAuthority(userCriterion)).toBe("user");
		const revised = { ...userCriterion, version: "2", statement: "Changed constraint" };
		expect(() => assertCriterionRevisionAuthority(userCriterion, revised, "planner")).toThrow(
			"requires user authority",
		);
		expect(() => assertCriterionRevisionAuthority(userCriterion, revised, "user")).not.toThrow();
	});
});
