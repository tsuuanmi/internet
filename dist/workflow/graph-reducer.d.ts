import { type WorkflowExecutionRecord, type WorkflowFailure, type WorkflowGraphNode, type WorkflowGraphSnapshot, type WorkflowLifecycle, type WorkflowNodeInputReceipt, type WorkflowNodeOutputReceipt, type WorkflowPhase, type WorkflowRecoveryPlan } from "#internet/workflow/graph";
export declare class WorkflowGraphTransitionError extends Error {
    constructor(message: string);
}
export declare function readyWorkflowNodeIds(graph: WorkflowGraphSnapshot): readonly string[];
export declare function promotableWorkflowNodeIds(graph: WorkflowGraphSnapshot): readonly string[];
export declare function promoteWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, input: WorkflowNodeInputReceipt): WorkflowGraphSnapshot;
export declare function startWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, execution: WorkflowExecutionRecord): WorkflowGraphSnapshot;
export declare function updateWorkflowExecution(graph: WorkflowGraphSnapshot, nodeId: string, executionId: string, mutate: (current: WorkflowExecutionRecord) => WorkflowExecutionRecord): WorkflowGraphSnapshot;
export declare function waitWorkflowNodeForUser(graph: WorkflowGraphSnapshot, nodeId: string, executionId: string, failure: WorkflowFailure): WorkflowGraphSnapshot;
export declare function resumeWorkflowNodeFromUserWait(graph: WorkflowGraphSnapshot, nodeId: string, executionId: string): WorkflowGraphSnapshot;
export declare function completeWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, executionId: string, output: WorkflowNodeOutputReceipt): WorkflowGraphSnapshot;
export declare function completeWorkflowGateNode(graph: WorkflowGraphSnapshot, nodeId: string, output: WorkflowNodeOutputReceipt): WorkflowGraphSnapshot;
export declare function recoverWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, executionId: string, executionState: "FENCED" | "ORPHANED" | "FAILED", failure: WorkflowFailure, recovery: WorkflowRecoveryPlan): WorkflowGraphSnapshot;
export declare function retryWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, execution: WorkflowExecutionRecord): WorkflowGraphSnapshot;
export declare function failWorkflowNode(graph: WorkflowGraphSnapshot, nodeId: string, failure: WorkflowFailure): WorkflowGraphSnapshot;
export declare function appendWorkflowNodes(graph: WorkflowGraphSnapshot, nodes: readonly WorkflowGraphNode[]): WorkflowGraphSnapshot;
export declare function setWorkflowGraphStatus(graph: WorkflowGraphSnapshot, phase: WorkflowPhase, lifecycle: WorkflowLifecycle): WorkflowGraphSnapshot;
export declare function cancelWorkflowGraph(graph: WorkflowGraphSnapshot): WorkflowGraphSnapshot;
//# sourceMappingURL=graph-reducer.d.ts.map