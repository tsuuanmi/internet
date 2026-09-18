import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowExecution } from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
export declare function fenceWorkflowExecution(executions: WorkflowExecutionStore, execution: WorkflowExecution, now: () => number, code: string, message: string): WorkflowExecution | undefined;
export declare function failWorkflowExecution(executions: WorkflowExecutionStore, execution: WorkflowExecution, now: () => number, code: string, message: string, retryable: boolean): WorkflowExecution | undefined;
export declare function setWorkflowWorkItemReady(workItems: WorkflowWorkItemStore, runId: string, workItemId: string, now: () => number): void;
export declare function setWorkflowWorkItemFailed(workItems: WorkflowWorkItemStore, runId: string, workItemId: string, now: () => number): void;
export declare function fenceWorkflowWorkItem(workItems: WorkflowWorkItemStore, runId: string, workItemId: string, now: () => number): void;
//# sourceMappingURL=execution-state.d.ts.map