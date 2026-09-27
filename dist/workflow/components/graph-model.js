import { WorkflowComponentError } from "#internet/workflow/components/contracts";
export const WORKFLOW_DEPENDENCY_GRAPH_SCHEMA = "@tsuuanmi/internet-workflow-dependency-graph";
export const WORKFLOW_GRAPH_ANALYSIS_SCHEMA = "@tsuuanmi/internet-workflow-graph-analysis";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function detectCycles(ids, adjacency) {
    const state = new Map();
    const stack = [];
    const stackIndex = new Map();
    const cycles = new Map();
    const visit = (id) => {
        state.set(id, 1);
        stackIndex.set(id, stack.length);
        stack.push(id);
        for (const next of adjacency.get(id) ?? []) {
            const nextState = state.get(next) ?? 0;
            if (nextState === 0) {
                visit(next);
                continue;
            }
            if (nextState !== 1)
                continue;
            const start = stackIndex.get(next);
            if (start === undefined)
                continue;
            const cycle = stack.slice(start);
            const smallest = [...cycle].sort(compareText)[0];
            const pivot = cycle.indexOf(smallest);
            const normalized = [...cycle.slice(pivot), ...cycle.slice(0, pivot)];
            cycles.set(normalized.join("\0"), normalized);
        }
        stack.pop();
        stackIndex.delete(id);
        state.set(id, 2);
    };
    for (const id of ids)
        if ((state.get(id) ?? 0) === 0)
            visit(id);
    return [...cycles.values()].sort((left, right) => compareText(left.join("\0"), right.join("\0")));
}
export class TypeScriptWorkflowGraphModel {
    analyze(graph) {
        if (graph.graphId.trim() === "")
            throw new WorkflowComponentError("INVALID_INPUT", "workflow graph id is required");
        if (!Number.isInteger(graph.revision) || graph.revision < 0)
            throw new WorkflowComponentError("INVALID_INPUT", "workflow graph revision must be a non-negative integer");
        const ids = graph.nodes.map((node) => node.id).sort(compareText);
        if (ids.some((id) => id.trim() === ""))
            throw new WorkflowComponentError("INVALID_INPUT", "workflow graph node id is required");
        if (new Set(ids).size !== ids.length)
            throw new WorkflowComponentError("INVALID_INPUT", "workflow graph contains duplicate node ids");
        const nodes = new Set(ids);
        const adjacency = new Map(ids.map((id) => [id, new Set()]));
        const indegree = new Map(ids.map((id) => [id, 0]));
        for (const edge of graph.edges) {
            if (!nodes.has(edge.from))
                throw new WorkflowComponentError("INVALID_INPUT", `unknown graph node ${edge.from}`);
            if (!nodes.has(edge.to))
                throw new WorkflowComponentError("INVALID_INPUT", `unknown graph node ${edge.to}`);
            const targets = adjacency.get(edge.from);
            if (targets.has(edge.to))
                continue;
            targets.add(edge.to);
            indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
        }
        const sortedAdjacency = new Map([...adjacency.entries()].map(([id, targets]) => [id, [...targets].sort(compareText)]));
        const readyNodes = ids.filter((id) => indegree.get(id) === 0);
        const remainingIndegree = new Map(indegree);
        const layers = [];
        let frontier = [...readyNodes];
        while (frontier.length > 0) {
            const layer = [...frontier].sort(compareText);
            layers.push(layer);
            const next = new Set();
            for (const id of layer) {
                for (const target of sortedAdjacency.get(id) ?? []) {
                    const value = (remainingIndegree.get(target) ?? 0) - 1;
                    remainingIndegree.set(target, value);
                    if (value === 0)
                        next.add(target);
                }
            }
            frontier = [...next].sort(compareText);
        }
        const order = layers.flat();
        const acyclic = order.length === ids.length;
        return {
            schema: WORKFLOW_GRAPH_ANALYSIS_SCHEMA,
            version: 1,
            graphId: graph.graphId,
            revision: graph.revision,
            acyclic,
            topologicalOrder: acyclic ? order : [],
            topologicalLayers: acyclic ? layers : [],
            readyNodes,
            cycles: acyclic ? [] : detectCycles(ids, sortedAdjacency),
        };
    }
}
//# sourceMappingURL=graph-model.js.map