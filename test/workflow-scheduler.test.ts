import { describe, expect, it } from "vitest";
import type { WorkflowGraphNode, WorkflowGraphSnapshot } from "#internet/workflow/graph";
import { promoteReadyWorkflowNodes, schedulableWorkflowNodes } from "#internet/workflow/scheduler";

const hash = "a".repeat(64);
const resultId = "b".repeat(64);
const completedAt = "2026-09-14T10:00:00.000Z";

function snapshot(nodes: readonly WorkflowGraphNode[]): WorkflowGraphSnapshot {
	return {
		schema: "@tsuuanmi/internet-workflow-graph",
		version: 1,
		graphRevision: 0,
		eventSeq: 0,
		phase: "RESEARCH",
		lifecycle: "RUNNING",
		nodes: Object.fromEntries(nodes.map((node) => [node.nodeId, node])),
	};
}

describe("workflow graph scheduler", () => {
	it("promotes dependency-satisfied nodes without replaying completed work", () => {
		const first: WorkflowGraphNode = {
			nodeId: "first",
			kind: "TEAM_MEMBER",
			phase: "RESEARCH",
			dependencies: [],
			state: "COMPLETED",
			input: { inputHash: hash, dependencyOutputHashes: {} },
			output: { resultId, outputHash: hash, completedAt },
		};
		const second: WorkflowGraphNode = {
			nodeId: "second",
			kind: "TEAM_MEMBER",
			phase: "RESEARCH",
			dependencies: ["first"],
			state: "WAITING",
		};
		const promoted = promoteReadyWorkflowNodes(snapshot([first, second]), (node) => ({
			inputHash: "c".repeat(64),
			dependencyOutputHashes: Object.fromEntries(node.dependencies.map((dependency) => [dependency, hash])),
		}));
		expect(promoted.nodes.first?.state).toBe("COMPLETED");
		expect(promoted.nodes.second?.state).toBe("READY");
		expect(schedulableWorkflowNodes(promoted).map((node) => node.nodeId)).toEqual(["second"]);
	});
});
