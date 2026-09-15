import { describe, expect, it } from "vitest";
import {
	assertWorkflowGraph,
	canReuseCompletedWorkflowNode,
	type WorkflowGraphNode,
	type WorkflowGraphSnapshot,
	workflowNodeDependenciesCompleted,
	workflowNodeId,
	workflowNodeInputMatchesDependencies,
} from "#internet/workflow/graph";

const now = "2026-09-10T10:00:00.000Z";
const resultId = "a".repeat(64);

function completedNode(nodeId: string, dependencies: readonly string[] = []): WorkflowGraphNode {
	return {
		nodeId,
		kind: "TEAM_MEMBER",
		phase: "RESEARCH",
		dependencies,
		state: "COMPLETED",
		input: {
			inputHash: "b".repeat(64),
			dependencyOutputHashes: Object.fromEntries(dependencies.map((dependency) => [dependency, "c".repeat(64)])),
		},
		output: { resultId, outputHash: "c".repeat(64), completedAt: now },
	};
}

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

describe("workflow graph model", () => {
	it("builds stable research, review, and remediation identities", () => {
		expect(workflowNodeId.researchMember("B", 2, 2)).toBe("research:B:round:2:member:2");
		expect(workflowNodeId.researchSynthesis("B")).toBe("research:B:synthesis");
		expect(workflowNodeId.researchHandoffGate()).toBe("research:handoff-gate");
		expect(workflowNodeId.writerImplementation()).toBe("writer:implementation");
		expect(workflowNodeId.reviewMember(2, "A", 1, 2)).toBe("review:cycle:2:A:round:1:member:2");
		expect(workflowNodeId.reviewSynthesis(2, "A")).toBe("review:cycle:2:A:synthesis");
		expect(workflowNodeId.reviewHandoffGate(2)).toBe("review:cycle:2:handoff-gate");
		expect(workflowNodeId.writerRemediation(2)).toBe("writer:remediation:cycle:2");
	});

	it("reuses completion only for the exact input receipt", () => {
		const node = completedNode("research:A:round:1:member:1");
		expect(canReuseCompletedWorkflowNode(node, node.input?.inputHash ?? "")).toBe(true);
		expect(canReuseCompletedWorkflowNode(node, "different-input")).toBe(false);
	});

	it("requires dependency completion and exact dependency output hashes", () => {
		const first = completedNode("first");
		const second = completedNode("second", [first.nodeId]);
		const nodes = snapshot([first, second]).nodes;
		expect(workflowNodeDependenciesCompleted(second, nodes)).toBe(true);
		expect(workflowNodeInputMatchesDependencies(second, nodes)).toBe(true);
	});

	it("rejects malformed dependency receipts and cycles", () => {
		const first = completedNode("first");
		const second = completedNode("second", [first.nodeId]);
		expect(() =>
			assertWorkflowGraph(snapshot([first, { ...second, input: { inputHash: "b".repeat(64), dependencyOutputHashes: {} } }])),
		).toThrow("keys do not match dependencies");
		const a: WorkflowGraphNode = {
			nodeId: "a",
			kind: "TEAM_MEMBER",
			phase: "RESEARCH",
			dependencies: ["b"],
			state: "WAITING",
		};
		const b: WorkflowGraphNode = { ...a, nodeId: "b", dependencies: ["a"] };
		expect(() => assertWorkflowGraph(snapshot([a, b]))).toThrow("dependency cycle");
	});

	it("requires live unique executions for running nodes", () => {
		const running: WorkflowGraphNode = {
			nodeId: "writer:implementation",
			kind: "WRITER_IMPLEMENTATION",
			phase: "WRITER",
			dependencies: [],
			state: "RUNNING",
			input: { inputHash: "b".repeat(64), dependencyOutputHashes: {} },
		};
		expect(() => assertWorkflowGraph(snapshot([running]))).toThrow("requires a live execution");
		const live = {
			...running,
			execution: {
				executionId: "exec-1",
				attempt: 1,
				state: "ACTIVE" as const,
				ownerInstanceId: "driver-1",
				startedAt: now,
				heartbeatAt: now,
				leaseUntil: "2026-09-10T10:01:00.000Z",
			},
		};
		expect(() => assertWorkflowGraph(snapshot([live]))).not.toThrow();
		expect(() => assertWorkflowGraph(snapshot([live, { ...live, nodeId: "writer:other" }]))).toThrow(
			"execution id is duplicated",
		);
	});
});
