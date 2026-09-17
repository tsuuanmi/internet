import { describe, expect, it } from "vitest";
import type { WorkflowInputBundle } from "#internet/workflow/kernel/types";
import {
	executeWorkflowPlanning,
	parseWorkflowPlanningOutput,
	WORKFLOW_PLANNING_CAPABILITY,
	workflowPlanningModeForNeedType,
} from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);
const artifact = (char: string) => ({ runId, artifactId: char.repeat(64) });

const inputBundle: WorkflowInputBundle = {
	schema: "@tsuuanmi/internet-workflow-input-bundle",
	version: 1,
	bundleId: "f".repeat(64),
	runId,
	workItemId: "2".repeat(32),
	capability: { id: WORKFLOW_PLANNING_CAPABILITY.id, version: WORKFLOW_PLANNING_CAPABILITY.version },
	projection: { id: "planning-input", version: "1" },
	artifacts: [],
	facts: [{ name: "acceptedSource", value: "Build the feature" }],
	createdAt: "2026-09-17T09:00:00.000Z",
};

const initialOutput = {
	mode: "INITIAL" as const,
	objective: {
		objectiveId: "objective-1",
		version: "1",
		admissionId: "3".repeat(32),
		statement: "Build the feature",
		constraints: [],
	},
	acceptanceCriteria: {
		criteriaSetId: "criteria-1",
		version: "1",
		objective: artifact("a"),
		criteria: [
			{
				criterionId: "ac-1",
				version: "1",
				statement: "Feature works",
				provenance: "planner_derived" as const,
				required: true,
				assessmentPolicy: { requiredMethods: ["reviewer" as const] },
			},
		],
	},
	plan: {
		planId: "plan-1",
		version: "1",
		objective: artifact("a"),
		acceptanceCriteria: artifact("b"),
		tasks: [],
		assumptions: [],
		risks: [],
	},
	needs: [],
	findings: [],
};

describe("workflow planning contract", () => {
	it("defines a read-only semantic planning capability independent of provider topology", () => {
		expect(WORKFLOW_PLANNING_CAPABILITY.sideEffect).toBe("READ_ONLY");
		expect(WORKFLOW_PLANNING_CAPABILITY.executorKinds).toEqual(["reasoning"]);
		expect(WORKFLOW_PLANNING_CAPABILITY.acceptedNeedTypes).toContain("requirements_change");
	});

	it("derives Planner re-entry mode from typed Need semantics", () => {
		expect(workflowPlanningModeForNeedType("planning")).toBe("INITIAL");
		expect(workflowPlanningModeForNeedType("plan_change")).toBe("PLAN_CHANGE");
		expect(workflowPlanningModeForNeedType("requirements_change")).toBe("REQUIREMENTS_CHANGE");
		expect(workflowPlanningModeForNeedType("clarification")).toBe("CLARIFICATION");
		expect(workflowPlanningModeForNeedType("execution")).toBeUndefined();
	});

	it("validates executor output at the planning boundary", async () => {
		const output = await executeWorkflowPlanning(
			{ execute: async () => initialOutput },
			{ mode: "INITIAL", inputBundle },
		);
		expect(output.objective?.objectiveId).toBe("objective-1");
	});

	it("rejects executor output for a different planning mode", async () => {
		await expect(
			executeWorkflowPlanning(
				{ execute: async () => ({ ...initialOutput, mode: "REQUIREMENTS_CHANGE" }) },
				{ mode: "INITIAL", inputBundle },
			),
		).rejects.toThrow("output mode does not match request");
	});

	it("keeps plan changes distinct from requirements changes", () => {
		expect(() =>
			parseWorkflowPlanningOutput({
				...initialOutput,
				mode: "PLAN_CHANGE",
			}),
		).toThrow("cannot revise Objective or AcceptanceCriteria");
	});
});
