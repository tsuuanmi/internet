import { describe, expect, it } from "vitest";
import type { WorkflowArtifact, WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import {
	currentWorkflowArtifactIds,
	staleWorkflowWorkItems,
	workflowInputBundleIsCurrent,
} from "#internet/workflow/runtime/index";

const runId = "1".repeat(32);
const sourceId = "a".repeat(64);
const replacementId = "b".repeat(64);
const derivedId = "d".repeat(64);
const bundleId = "c".repeat(64);
const derivedBundleId = "e".repeat(64);

const source = {
	runId,
	artifactId: sourceId,
	lineage: [],
} as unknown as WorkflowArtifact;
const replacement = {
	runId,
	artifactId: replacementId,
	lineage: [{ relation: "supersedes", artifact: { runId, artifactId: sourceId } }],
} as unknown as WorkflowArtifact;
const bundle = {
	runId,
	bundleId,
	artifacts: [{ runId, artifactId: sourceId }],
} as unknown as WorkflowInputBundle;
const derivedBundle = {
	runId,
	bundleId: derivedBundleId,
	artifacts: [{ runId, artifactId: sourceId }],
} as unknown as WorkflowInputBundle;
const derived = {
	runId,
	artifactId: derivedId,
	inputBundleId: derivedBundleId,
	lineage: [],
} as unknown as WorkflowArtifact;
const item = {
	state: "SUCCEEDED",
	inputBundleId: bundleId,
} as unknown as WorkflowWorkItem;

describe("workflow vNext causal invalidation", () => {
	it("marks superseded exact inputs as non-current", () => {
		expect(currentWorkflowArtifactIds([source, replacement])).toEqual(new Set([replacementId]));
		expect(workflowInputBundleIsCurrent(bundle, [source, replacement])).toBe(false);
		expect(staleWorkflowWorkItems([item], [bundle], [source, replacement])).toEqual([item]);
	});

	it("propagates staleness through artifacts produced from stale InputBundles", () => {
		expect(currentWorkflowArtifactIds([source, replacement, derived], [bundle, derivedBundle])).toEqual(
			new Set([replacementId]),
		);
	});

	it("keeps an exact input current until an invalidating lineage edge exists", () => {
		expect(workflowInputBundleIsCurrent(bundle, [source])).toBe(true);
		expect(staleWorkflowWorkItems([item], [bundle], [source])).toEqual([]);
	});
});
