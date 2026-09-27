export declare const WORKFLOW_DEPENDENCY_GRAPH_SCHEMA: "@tsuuanmi/internet-workflow-dependency-graph";
export declare const WORKFLOW_GRAPH_ANALYSIS_SCHEMA: "@tsuuanmi/internet-workflow-graph-analysis";
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
export declare class TypeScriptWorkflowGraphModel implements WorkflowGraphModelPort {
    analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1;
}
//# sourceMappingURL=graph-model.d.ts.map