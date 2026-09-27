import { WorkflowComponentError } from "#internet/workflow/components/contracts";

export const WORKFLOW_DEPENDENCY_GRAPH_SCHEMA = "@tsuuanmi/internet-workflow-dependency-graph" as const;
export const WORKFLOW_GRAPH_ANALYSIS_SCHEMA = "@tsuuanmi/internet-workflow-graph-analysis" as const;

export interface WorkflowDependencyGraphNodeV1 {
	readonly id: string;
	readonly kind: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkflowDependencyGraphEdgeV1 {
	readonly from: string;
	readonly to: string;
	readonly kind?: string;
}

export interface WorkflowDependencyGraphV1 {
	readonly schema: typeof WORKFLOW_DEPENDENCY_GRAPH_SCHEMA;
	readonly version: 1;
	readonly graphId: string;
	readonly revision: number;
	readonly nodes: readonly WorkflowDependencyGraphNodeV1[];
	readonly edges: readonly WorkflowDependencyGraphEdgeV1[];
}

export interface WorkflowGraphAnalysisV1 {
	readonly schema: typeof WORKFLOW_GRAPH_ANALYSIS_SCHEMA;
	readonly version: 1;
	readonly graphId: string;
	readonly revision: number;
	readonly acyclic: boolean;
	readonly topologicalOrder: readonly string[];
	readonly topologicalLayers: readonly (readonly string[])[];
	readonly readyNodes: readonly string[];
	readonly cycles: readonly (readonly string[])[];
}

export interface WorkflowGraphModelPort {
	analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1;
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function detectCycles(ids: readonly string[], adjacency: ReadonlyMap<string, readonly string[]>): readonly (readonly string[])[] {
	const state = new Map<string, 0 | 1 | 2>();
	const stack: string[] = [];
	const stackIndex = new Map<string, number>();
	const cycles = new Map<string, readonly string[]>();

	const visit = (id: string): void => {
		state.set(id, 1);
		stackIndex.set(id, stack.length);
		stack.push(id);
		for (const next of adjacency.get(id) ?? []) {
			const nextState = state.get(next) ?? 0;
			if (nextState === 0) {
				visit(next);
				continue;
			}
			if (nextState !== 1) continue;
			const start = stackIndex.get(next);
			if (start === undefined) continue;
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

	for (const id of ids) if ((state.get(id) ?? 0) === 0) visit(id);
	return [...cycles.values()].sort((left, right) => compareText(left.join("\0"), right.join("\0")));
}

export class TypeScriptWorkflowGraphModel implements WorkflowGraphModelPort {
	analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1 {
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
		const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
		const indegree = new Map(ids.map((id) => [id, 0]));
		for (const edge of graph.edges) {
			if (!nodes.has(edge.from))
				throw new WorkflowComponentError("INVALID_INPUT", `unknown graph node ${edge.from}`);
			if (!nodes.has(edge.to))
				throw new WorkflowComponentError("INVALID_INPUT", `unknown graph node ${edge.to}`);
			const targets = adjacency.get(edge.from)!;
			if (targets.has(edge.to)) continue;
			targets.add(edge.to);
			indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
		}

		const sortedAdjacency = new Map(
			[...adjacency.entries()].map(([id, targets]) => [id, [...targets].sort(compareText)] as const),
		);
		const readyNodes = ids.filter((id) => indegree.get(id) === 0);
		const remainingIndegree = new Map(indegree);
		const layers: string[][] = [];
		let frontier = [...readyNodes];
		while (frontier.length > 0) {
			const layer = [...frontier].sort(compareText);
			layers.push(layer);
			const next = new Set<string>();
			for (const id of layer) {
				for (const target of sortedAdjacency.get(id) ?? []) {
					const value = (remainingIndegree.get(target) ?? 0) - 1;
					remainingIndegree.set(target, value);
					if (value === 0) next.add(target);
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
