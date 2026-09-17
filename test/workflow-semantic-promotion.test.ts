import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import {
	promoteWorkflowSemanticResult,
	WORKFLOW_PLANNING_CAPABILITY,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
} from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);
const workItemId = "2".repeat(32);
const needArtifactId = "5".repeat(64);
const inputBundleId = "3".repeat(64);
const capability = { id: WORKFLOW_PLANNING_CAPABILITY.id, version: WORKFLOW_PLANNING_CAPABILITY.version };

const workItem: WorkflowWorkItem = {
	schema: "@tsuuanmi/internet-workflow-work-item",
	version: 1,
	revision: 1,
	workItemId,
	runId,
	needArtifact: { runId, artifactId: needArtifactId },
	needId: "planning-need",
	requestOwner: { kind: "run", id: runId },
	capability,
	sideEffect: "READ_ONLY",
	state: "SUCCEEDED",
	inputBundleId,
	executionIds: ["execution-1"],
	resultArtifactIds: [],
	receiptIds: [],
	createdAt: "2026-09-17T09:00:00.000Z",
	updatedAt: "2026-09-17T09:00:00.000Z",
};

const inputBundle: WorkflowInputBundle = {
	schema: "@tsuuanmi/internet-workflow-input-bundle",
	version: 1,
	bundleId: inputBundleId,
	runId,
	workItemId,
	capability,
	projection: { id: "planning-input", version: "1" },
	artifacts: [],
	facts: [],
	createdAt: "2026-09-17T09:00:00.000Z",
};

const objectiveDraft = {
	type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective,
	payload: {
		objectiveId: "objective-1",
		version: "1",
		admissionId: "4".repeat(32),
		statement: "Build the feature",
		constraints: [],
	},
};

describe("workflow semantic result promotion", () => {
	it("promotes validated semantic output and preserves receipt references separately", () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-workflow-semantic-")));
		const result = promoteWorkflowSemanticResult(
			{ workItem, inputBundle, capability: WORKFLOW_PLANNING_CAPABILITY, artifactStore: store },
			{
				executionId: "execution-1",
				workItemId,
				inputBundleId,
				receiptIds: ["executor-receipt-1"],
				artifacts: [objectiveDraft],
			},
		);
		const [artifact] = result.artifacts;
		expect(artifact?.type).toBe(WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective);
		expect(artifact?.producer).toEqual({ kind: "work_item", id: workItemId });
		expect(artifact?.inputBundleId).toBe(inputBundleId);
		expect(result.receiptIds).toEqual(["executor-receipt-1"]);
	});

	it("rejects results from an execution that does not belong to the WorkItem", () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-workflow-semantic-execution-")));
		expect(() =>
			promoteWorkflowSemanticResult(
				{ workItem, inputBundle, capability: WORKFLOW_PLANNING_CAPABILITY, artifactStore: store },
				{
					executionId: "execution-stale",
					workItemId,
					inputBundleId,
					receiptIds: [],
					artifacts: [],
				},
			),
		).toThrow("execution mismatch");
	});

	it("validates all artifact contracts before writing any artifact", () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-workflow-semantic-atomic-")));
		expect(() =>
			promoteWorkflowSemanticResult(
				{ workItem, inputBundle, capability: WORKFLOW_PLANNING_CAPABILITY, artifactStore: store },
				{
					executionId: "execution-1",
					workItemId,
					inputBundleId,
					receiptIds: [],
					artifacts: [
						objectiveDraft,
						{
							type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report,
							payload: { reportId: "report-1", title: "Report", body: "Body", evidence: [] },
						},
					],
				},
			),
		).toThrow("cannot produce artifact type report");
		expect(store.list(runId)).toEqual([]);
	});
});
