import {
	assertWorkflowGraph,
	type WorkflowExecutionRecord,
	type WorkflowFailure,
	type WorkflowGraphNode,
	type WorkflowGraphSnapshot,
	type WorkflowNodeInputReceipt,
	type WorkflowNodeOutputReceipt,
	type WorkflowRecoveryPlan,
	workflowNodeDependenciesCompleted,
	workflowNodeInputMatchesDependencies,
} from "#internet/workflow/graph";

export class WorkflowGraphTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowGraphTransitionError";
	}
}

export function readyWorkflowNodeIds(graph: WorkflowGraphSnapshot): readonly string[] {
	return Object.values(graph.nodes)
		.filter((node) => node.state === "READY")
		.map((node) => node.nodeId)
		.sort();
}

export function promotableWorkflowNodeIds(graph: WorkflowGraphSnapshot): readonly string[] {
	return Object.values(graph.nodes)
		.filter(
			(node) =>
				node.state === "WAITING" &&
				node.waitReason === undefined &&
				workflowNodeDependenciesCompleted(node, graph.nodes),
		)
		.map((node) => node.nodeId)
		.sort();
}

export function promoteWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	input: WorkflowNodeInputReceipt,
): WorkflowGraphSnapshot {
	const node = requireNode(graph, nodeId);
	if (node.state !== "WAITING") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot become READY from ${node.state}`);
	}
	if (node.waitReason !== undefined) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} is waiting on ${node.waitReason}`);
	}
	if (!workflowNodeDependenciesCompleted(node, graph.nodes)) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} has incomplete dependencies`);
	}
	const nextNode: WorkflowGraphNode = { ...node, state: "READY", input };
	const candidate = replaceNode(graph, nextNode);
	if (!workflowNodeInputMatchesDependencies(nextNode, candidate.nodes)) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} input receipt does not match dependency outputs`);
	}
	return checked(candidate);
}

export function startWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	execution: WorkflowExecutionRecord,
): WorkflowGraphSnapshot {
	const node = requireNode(graph, nodeId);
	if (node.state !== "READY") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot start from ${node.state}`);
	}
	if (!node.input || !workflowNodeInputMatchesDependencies(node, graph.nodes)) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot start with stale dependency inputs`);
	}
	if (execution.state !== "STARTING" && execution.state !== "ACTIVE") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} start requires a live execution state`);
	}
	return checked(replaceNode(graph, { ...node, state: "RUNNING", execution, failure: undefined, recovery: undefined }));
}

export function completeWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	executionId: string,
	output: WorkflowNodeOutputReceipt,
): WorkflowGraphSnapshot {
	const node = requireCurrentExecution(graph, nodeId, executionId);
	if (node.state !== "RUNNING") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot complete from ${node.state}`);
	}
	const execution = node.execution;
	if (!execution || (execution.state !== "STARTING" && execution.state !== "ACTIVE")) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} execution is not live`);
	}
	return checked(
		replaceNode(graph, {
			...node,
			state: "COMPLETED",
			output,
			execution: { ...execution, state: "SUCCEEDED" },
			failure: undefined,
			recovery: undefined,
		}),
	);
}

export function recoverWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	executionId: string,
	executionState: "FENCED" | "ORPHANED" | "FAILED",
	failure: WorkflowFailure,
	recovery: WorkflowRecoveryPlan,
): WorkflowGraphSnapshot {
	const node = requireCurrentExecution(graph, nodeId, executionId);
	if (node.state !== "RUNNING" && node.state !== "WAITING_USER") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot recover from ${node.state}`);
	}
	if (!node.execution) throw new WorkflowGraphTransitionError(`workflow node ${nodeId} has no execution to recover`);
	return checked(
		replaceNode(graph, {
			...node,
			state: "RECOVERING",
			execution: { ...node.execution, state: executionState },
			failure,
			recovery,
		}),
	);
}

export function retryWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	execution: WorkflowExecutionRecord,
): WorkflowGraphSnapshot {
	const node = requireNode(graph, nodeId);
	if (node.state !== "RECOVERING") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot retry from ${node.state}`);
	}
	if (!node.input || !workflowNodeInputMatchesDependencies(node, graph.nodes)) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot retry with stale dependency inputs`);
	}
	if (execution.state !== "STARTING" && execution.state !== "ACTIVE") {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} retry requires a live execution state`);
	}
	if (node.recovery?.attempt !== execution.attempt) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} retry attempt does not match recovery plan`);
	}
	return checked(replaceNode(graph, { ...node, state: "RUNNING", execution, failure: undefined, recovery: undefined }));
}

export function failWorkflowNode(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	failure: WorkflowFailure,
): WorkflowGraphSnapshot {
	const node = requireNode(graph, nodeId);
	if (node.state === "COMPLETED" || node.state === "CANCELLED") {
		throw new WorkflowGraphTransitionError(`terminal workflow node ${nodeId} cannot fail from ${node.state}`);
	}
	const execution = node.execution;
	return checked(
		replaceNode(graph, {
			...node,
			state: "FAILED",
			failure,
			recovery: undefined,
			...(execution === undefined ? {} : { execution: { ...execution, state: "FAILED" as const } }),
		}),
	);
}

function requireNode(graph: WorkflowGraphSnapshot, nodeId: string): WorkflowGraphNode {
	const node = graph.nodes[nodeId];
	if (node === undefined) throw new WorkflowGraphTransitionError(`workflow node ${nodeId} does not exist`);
	return node;
}

function requireCurrentExecution(
	graph: WorkflowGraphSnapshot,
	nodeId: string,
	executionId: string,
): WorkflowGraphNode {
	const node = requireNode(graph, nodeId);
	if (node.execution?.executionId !== executionId) {
		throw new WorkflowGraphTransitionError(`workflow node ${nodeId} rejected stale execution ${executionId}`);
	}
	return node;
}

function replaceNode(graph: WorkflowGraphSnapshot, node: WorkflowGraphNode): WorkflowGraphSnapshot {
	return {
		...graph,
		graphRevision: graph.graphRevision + 1,
		nodes: { ...graph.nodes, [node.nodeId]: node },
	};
}

function checked(graph: WorkflowGraphSnapshot): WorkflowGraphSnapshot {
	assertWorkflowGraph(graph);
	return graph;
}
