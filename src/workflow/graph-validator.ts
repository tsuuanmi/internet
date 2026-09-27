import { WORKFLOW_GRAPH_ANALYSIS_SCHEMA, type WorkflowGraphModelPort } from "#internet/workflow/components";
import { assertWorkflowGraphState, type WorkflowGraphSnapshot } from "#internet/workflow/graph";

export class WorkflowGraphValidator {
	private readonly graphModel: WorkflowGraphModelPort;

	constructor(graphModel: WorkflowGraphModelPort) {
		this.graphModel = graphModel;
	}

	assert(graphId: string, graph: WorkflowGraphSnapshot): void {
		if (graphId.trim() === "") throw new Error("workflow graph id is required");
		assertWorkflowGraphState(graph);
		const analysis = this.graphModel.analyze({
			schema: "@tsuuanmi/internet-workflow-dependency-graph",
			version: 1,
			graphId,
			revision: graph.graphRevision,
			nodes: Object.values(graph.nodes).map((node) => ({ id: node.nodeId, kind: node.kind })),
			edges: Object.values(graph.nodes).flatMap((node) =>
				node.dependencies.map((dependencyId) => ({ from: dependencyId, to: node.nodeId })),
			),
		});
		if (analysis.schema !== WORKFLOW_GRAPH_ANALYSIS_SCHEMA || analysis.version !== 1) {
			throw new Error("unsupported workflow graph analysis schema");
		}
		if (analysis.graphId !== graphId || analysis.revision !== graph.graphRevision) {
			throw new Error("workflow graph model returned a mismatched graph identity");
		}
		if (!analysis.acyclic) {
			throw new Error(`workflow graph contains a dependency cycle at ${analysis.cycles[0]?.[0] ?? "unknown"}`);
		}
	}
}
