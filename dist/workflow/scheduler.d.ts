import type { WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowNodeInputReceipt } from "#internet/workflow/graph";
export type WorkflowNodeInputFactory = (node: WorkflowGraphNode, graph: WorkflowGraphSnapshot) => WorkflowNodeInputReceipt;
export declare function promoteReadyWorkflowNodes(graph: WorkflowGraphSnapshot, inputFor: WorkflowNodeInputFactory): WorkflowGraphSnapshot;
export declare function schedulableWorkflowNodes(graph: WorkflowGraphSnapshot): readonly WorkflowGraphNode[];
export declare function activeWorkflowNodes(graph: WorkflowGraphSnapshot): readonly WorkflowGraphNode[];
//# sourceMappingURL=scheduler.d.ts.map