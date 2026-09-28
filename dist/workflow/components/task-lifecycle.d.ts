import { type WorkflowComponentContractRef } from "#internet/workflow/components/contracts";
export declare const WORKFLOW_TASK_START_REQUEST_SCHEMA: "@tsuuanmi/internet-workflow-task-start-request";
export declare const WORKFLOW_TASK_HANDLE_SCHEMA: "@tsuuanmi/internet-workflow-task-handle";
export declare const WORKFLOW_TASK_STATUSES: readonly ["working", "input_required", "completed", "failed", "cancelled"];
export type WorkflowTaskStatus = (typeof WORKFLOW_TASK_STATUSES)[number];
export interface WorkflowTaskStartRequestV1 {
    readonly schema: typeof WORKFLOW_TASK_START_REQUEST_SCHEMA;
    readonly version: 1;
    readonly requestId: string;
    readonly ownerRef: string;
    readonly operation: WorkflowComponentContractRef;
    readonly subjectRef?: string;
    readonly inputRef?: string;
    readonly deadline?: string;
}
export interface WorkflowTaskHandleV1 {
    readonly schema: typeof WORKFLOW_TASK_HANDLE_SCHEMA;
    readonly version: 1;
    readonly taskId: string;
    readonly subjectRef?: string;
    readonly status: WorkflowTaskStatus;
    readonly pollAfterMs?: number;
}
export declare function assertWorkflowTaskStartRequest(value: WorkflowTaskStartRequestV1): asserts value is WorkflowTaskStartRequestV1;
export declare function assertWorkflowTaskHandle(value: WorkflowTaskHandleV1): asserts value is WorkflowTaskHandleV1;
//# sourceMappingURL=task-lifecycle.d.ts.map