import { describe, expect, it } from "vitest";
import {
	assertAcceptanceCriteriaRevisionAuthority,
	assertObjectiveRevisionAuthority,
	parseWorkflowAcceptanceCriteriaPayload,
	parseWorkflowNeedPayload,
	parseWorkflowPlanPayload,
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

	it("rejects cyclic PlanTask dependencies", () => {
		expect(() =>
			parseWorkflowPlanPayload({
				planId: "plan-cycle",
				version: "1",
				objective: objectiveArtifact,
				acceptanceCriteria: criteriaArtifact,
				tasks: [
					{
						taskId: "task-1",
						title: "One",
						description: "First task",
						dependsOn: ["task-2"],
						criterionIds: [],
						needIds: [],
					},
					{
						taskId: "task-2",
						title: "Two",
						description: "Second task",
						dependsOn: ["task-1"],
						criterionIds: [],
						needIds: [],
					},
				],
				assumptions: [],
				risks: [],
			}),
		).toThrow("dependency cycle");
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

	it("requires User authority to revise or remove User-owned criteria", () => {
		const current = {
			criteriaSetId: "criteria-1",
			version: "1",
			objective: objectiveArtifact,
			criteria: [userCriterion],
		};
		const revised = {
			...current,
			version: "2",
			criteria: [{ ...userCriterion, version: "2", statement: "Changed constraint" }],
		};
		expect(() => assertAcceptanceCriteriaRevisionAuthority(current, revised, ["planner"])).toThrow(
			"requires user authority",
		);
		expect(() => assertAcceptanceCriteriaRevisionAuthority(current, revised, ["user"])).not.toThrow();
	});

	it("does not allow Planner to mint User-owned objective constraints without User authority", () => {
		const current = {
			objectiveId: "objective-1",
			version: "1",
			admissionId: "3".repeat(32),
			statement: "Build the feature",
			constraints: [],
		};
		const revised = {
			...current,
			version: "2",
			constraints: [{ id: "constraint-1", statement: "Must remain local", provenance: "user" as const }],
		};
		expect(() => assertObjectiveRevisionAuthority(current, revised, ["planner"])).toThrow("requires user authority");
		expect(() => assertObjectiveRevisionAuthority(current, revised, ["planner", "user"])).not.toThrow();
	});
});
