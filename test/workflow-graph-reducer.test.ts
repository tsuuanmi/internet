import { describe, expect, it } from "vitest";
import type { WorkflowExecutionRecord, WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowNodeInputReceipt } from "#internet/workflow/graph";
import { completeWorkflowNode, promotableWorkflowNodeIds, promoteWorkflowNode, recoverWorkflowNode, readyWorkflowNodeIds, retryWorkflowNode, startWorkflowNode } from "#internet/workflow/graph-reducer";

const now = "2026-09-10T10:00:00.000Z";
const resultId = "a".repeat(64);
const firstOutputHash = "b".repeat(64);
const lateOutputHash = "c".repeat(64);
const currentOutputHash = "d".repeat(64);

function graph(nodes: readonly WorkflowGraphNode[]): WorkflowGraphSnapshot {
	return { schema: "@tsuuanmi/internet-workflow-graph", version: 1, graphRevision: 0, eventSeq: 0, phase: "RESEARCH", lifecycle: "RUNNING", nodes: Object.fromEntries(nodes.map((node) => [node.nodeId, node])) };
}

function execution(executionId: string, attempt = 1): WorkflowExecutionRecord {
	return { executionId, attempt, state: "ACTIVE", ownerInstanceId: "driver-1", startedAt: now, heartbeatAt: now, leaseUntil: "2026-09-10T10:01:00.000Z" };
}

function input(dependencyOutputHashes: Readonly<Record<string, string>> = {}): WorkflowNodeInputReceipt {
	return { inputHash: "e".repeat(64), dependencyOutputHashes };
}

describe("workflow graph reducer", () => {
	it("promotes only dependency-satisfied nodes with exact dependency receipts", () => {
		const first: WorkflowGraphNode = { nodeId: "first", kind: "TEAM_MEMBER", phase: "RESEARCH", dependencies: [], state: "COMPLETED", input: input(), output: { resultId, outputHash: firstOutputHash, completedAt: now } };
		const second: WorkflowGraphNode = { nodeId: "second", kind: "TEAM_MEMBER", phase: "RESEARCH", dependencies: ["first"], state: "WAITING" };
		const initial = graph([first, second]);
		expect(promotableWorkflowNodeIds(initial)).toEqual(["second"]);
		expect(() => promoteWorkflowNode(initial, "second", input({ first: "f".repeat(64) }))).toThrow("does not match");
		const ready = promoteWorkflowNode(initial, "second", input({ first: firstOutputHash }));
		expect(ready.nodes.second?.state).toBe("READY");
		expect(readyWorkflowNodeIds(ready)).toEqual(["second"]);
		expect(ready.graphRevision).toBe(1);
	});

	it("fences a failed execution and retries only the same logical node", () => {
		const node: WorkflowGraphNode = { nodeId: "research:B:round:2:member:2", kind: "TEAM_MEMBER", phase: "RESEARCH", dependencies: [], state: "READY", input: input() };
		const started = startWorkflowNode(graph([node]), node.nodeId, execution("exec-1"));
		const recovering = recoverWorkflowNode(started, node.nodeId, "exec-1", "FENCED", { class: "PROVIDER", code: "STALL_TIMEOUT", message: "stalled", retry: "RECREATE_SESSION", at: now }, { action: "RECREATE_SESSION", attempt: 2, maxAttempts: 3 });
		expect(recovering.nodes[node.nodeId]?.state).toBe("RECOVERING");
		const retried = retryWorkflowNode(recovering, node.nodeId, execution("exec-2", 2));
		expect(retried.nodes[node.nodeId]?.execution?.executionId).toBe("exec-2");
	});

	it("rejects late completion from a fenced execution", () => {
		const node: WorkflowGraphNode = { nodeId: "writer:implementation", kind: "WRITER_IMPLEMENTATION", phase: "WRITER", dependencies: [], state: "READY", input: input() };
		const started = startWorkflowNode(graph([node]), node.nodeId, execution("exec-old"));
		const recovering = recoverWorkflowNode(started, node.nodeId, "exec-old", "ORPHANED", { class: "TRANSPORT", code: "EXECUTION_ORPHANED", message: "owner lost", retry: "IMMEDIATE", at: now }, { action: "RECONCILE", attempt: 2, maxAttempts: 3 });
		const retried = retryWorkflowNode(recovering, node.nodeId, execution("exec-new", 2));
		expect(() => completeWorkflowNode(retried, node.nodeId, "exec-old", { resultId, outputHash: lateOutputHash, completedAt: now })).toThrow("rejected stale execution");
		const completed = completeWorkflowNode(retried, node.nodeId, "exec-new", { resultId, outputHash: currentOutputHash, completedAt: now });
		expect(completed.nodes[node.nodeId]?.output?.outputHash).toBe(currentOutputHash);
	});
});
