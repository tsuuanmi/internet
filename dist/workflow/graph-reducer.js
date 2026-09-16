import { assertWorkflowGraph, workflowNodeDependenciesCompleted, workflowNodeInputMatchesDependencies, } from "#internet/workflow/graph";
export class WorkflowGraphTransitionError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowGraphTransitionError";
    }
}
export function readyWorkflowNodeIds(graph) {
    return Object.values(graph.nodes)
        .filter((node) => node.state === "READY")
        .map((node) => node.nodeId)
        .sort();
}
export function promotableWorkflowNodeIds(graph) {
    return Object.values(graph.nodes)
        .filter((node) => node.state === "WAITING" &&
        node.waitReason === undefined &&
        workflowNodeDependenciesCompleted(node, graph.nodes))
        .map((node) => node.nodeId)
        .sort();
}
export function promoteWorkflowNode(graph, nodeId, input) {
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
    const nextNode = { ...node, state: "READY", input };
    const candidate = replaceNode(graph, nextNode);
    if (!workflowNodeInputMatchesDependencies(nextNode, candidate.nodes)) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} input receipt does not match dependency outputs`);
    }
    return checked(candidate);
}
export function startWorkflowNode(graph, nodeId, execution) {
    const node = requireNode(graph, nodeId);
    if (node.state !== "READY" && node.state !== "RECOVERING") {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot start from ${node.state}`);
    }
    if (!node.input || !workflowNodeInputMatchesDependencies(node, graph.nodes)) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot start with stale dependency inputs`);
    }
    if (execution.state !== "STARTING" && execution.state !== "ACTIVE") {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} start requires a live execution state`);
    }
    if (node.state === "RECOVERING" && node.recovery?.attempt !== execution.attempt) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} retry attempt does not match recovery plan`);
    }
    return checked(replaceNode(graph, {
        ...node,
        state: "RUNNING",
        execution,
        failure: undefined,
        recovery: undefined,
        waitReason: undefined,
    }));
}
export function updateWorkflowExecution(graph, nodeId, executionId, mutate) {
    const node = requireCurrentExecution(graph, nodeId, executionId);
    if (node.state !== "RUNNING") {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot update execution from ${node.state}`);
    }
    if (!node.execution)
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} has no execution`);
    const execution = mutate(node.execution);
    if (execution.executionId !== executionId) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} execution id cannot change in place`);
    }
    return checked(replaceNode(graph, { ...node, execution }));
}
export function completeWorkflowNode(graph, nodeId, executionId, output) {
    const node = requireCurrentExecution(graph, nodeId, executionId);
    if (node.state !== "RUNNING") {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot complete from ${node.state}`);
    }
    const execution = node.execution;
    if (!execution || (execution.state !== "STARTING" && execution.state !== "ACTIVE")) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} execution is not live`);
    }
    return checked(replaceNode(graph, {
        ...node,
        state: "COMPLETED",
        output,
        execution: { ...execution, state: "SUCCEEDED", providerState: "COMPLETED" },
        failure: undefined,
        recovery: undefined,
        waitReason: undefined,
    }));
}
export function recoverWorkflowNode(graph, nodeId, executionId, executionState, failure, recovery) {
    const node = requireCurrentExecution(graph, nodeId, executionId);
    if (node.state !== "RUNNING") {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} cannot recover from ${node.state}`);
    }
    if (!node.execution)
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} has no execution to recover`);
    return checked(replaceNode(graph, {
        ...node,
        state: "RECOVERING",
        execution: { ...node.execution, state: executionState },
        failure,
        recovery,
        waitReason: undefined,
    }));
}
export function retryWorkflowNode(graph, nodeId, execution) {
    return startWorkflowNode(graph, nodeId, execution);
}
export function failWorkflowNode(graph, nodeId, failure) {
    const node = requireNode(graph, nodeId);
    if (node.state === "COMPLETED" || node.state === "CANCELLED") {
        throw new WorkflowGraphTransitionError(`terminal workflow node ${nodeId} cannot fail from ${node.state}`);
    }
    const execution = node.execution;
    return checked(replaceNode(graph, {
        ...node,
        state: "FAILED",
        failure,
        recovery: undefined,
        waitReason: undefined,
        ...(execution === undefined ? {} : { execution: { ...execution, state: "FAILED" } }),
    }));
}
export function appendWorkflowNodes(graph, nodes) {
    if (nodes.length === 0)
        return graph;
    const nextNodes = { ...graph.nodes };
    for (const node of nodes) {
        if (nextNodes[node.nodeId] !== undefined) {
            throw new WorkflowGraphTransitionError(`workflow graph node ${node.nodeId} already exists`);
        }
        nextNodes[node.nodeId] = node;
    }
    return checked({ ...graph, graphRevision: graph.graphRevision + 1, nodes: nextNodes });
}
export function setWorkflowGraphStatus(graph, phase, lifecycle) {
    if (graph.phase === phase && graph.lifecycle === lifecycle)
        return graph;
    return checked({ ...graph, graphRevision: graph.graphRevision + 1, phase, lifecycle });
}
export function cancelWorkflowGraph(graph) {
    const nodes = Object.fromEntries(Object.entries(graph.nodes).map(([nodeId, node]) => {
        if (node.state === "COMPLETED" || node.state === "FAILED" || node.state === "CANCELLED")
            return [nodeId, node];
        return [
            nodeId,
            {
                ...node,
                state: "CANCELLED",
                ...(node.execution === undefined
                    ? {}
                    : { execution: { ...node.execution, state: "CANCELLED" } }),
            },
        ];
    }));
    return checked({
        ...graph,
        graphRevision: graph.graphRevision + 1,
        lifecycle: "CANCELLED",
        nodes,
    });
}
function requireNode(graph, nodeId) {
    const node = graph.nodes[nodeId];
    if (node === undefined)
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} does not exist`);
    return node;
}
function requireCurrentExecution(graph, nodeId, executionId) {
    const node = requireNode(graph, nodeId);
    if (node.execution?.executionId !== executionId) {
        throw new WorkflowGraphTransitionError(`workflow node ${nodeId} rejected stale execution ${executionId}`);
    }
    return node;
}
function replaceNode(graph, node) {
    return {
        ...graph,
        graphRevision: graph.graphRevision + 1,
        nodes: { ...graph.nodes, [node.nodeId]: node },
    };
}
function checked(graph) {
    assertWorkflowGraph(graph);
    return graph;
}
//# sourceMappingURL=graph-reducer.js.map