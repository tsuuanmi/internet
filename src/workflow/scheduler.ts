import type { WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowNodeInputReceipt } from "#internet/workflow/graph";
import {
	promotableWorkflowNodeIds,
	promoteWorkflowNode,
	readyWorkflowNodeIds,
} from "#internet/workflow/graph-reducer";

export type WorkflowNodeInputFactory = (
	node: WorkflowGraphNode,
	graph: WorkflowGraphSnapshot,
) => WorkflowNodeInputReceipt;

export function promoteReadyWorkflowNodes(
	graph: WorkflowGraphSnapshot,
	inputFor: WorkflowNodeInputFactory,
): WorkflowGraphSnapshot {
	let next = graph;
	while (true) {
		const promotable = promotableWorkflowNodeIds(next);
		if (promotable.length === 0) return next;
		for (const nodeId of promotable) {
			const node = next.nodes[nodeId];
			if (node === undefined) throw new Error(`workflow scheduler lost node ${nodeId}`);
			next = promoteWorkflowNode(next, nodeId, inputFor(node, next));
		}
	}
}

export function schedulableWorkflowNodes(graph: WorkflowGraphSnapshot): readonly WorkflowGraphNode[] {
	return readyWorkflowNodeIds(graph).map((nodeId) => {
		const node = graph.nodes[nodeId];
		if (node === undefined) throw new Error(`workflow scheduler lost ready node ${nodeId}`);
		return node;
	});
}

export function activeWorkflowNodes(graph: WorkflowGraphSnapshot): readonly WorkflowGraphNode[] {
	return Object.values(graph.nodes)
		.filter((node) => node.state === "RUNNING" || node.state === "WAITING_USER" || node.state === "RECOVERING")
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}
