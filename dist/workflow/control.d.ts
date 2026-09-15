export declare const WORKFLOW_CONTROL_KINDS: readonly ["START_IMPLEMENTATION", "APPLY_REVIEWS", "CHECK_PR_HEALTH", "MERGE_AUTHORIZED"];
export type WorkflowControlKind = (typeof WORKFLOW_CONTROL_KINDS)[number];
export interface WorkflowControlMessage {
    readonly kind: WorkflowControlKind;
    readonly jobId: string;
    readonly createdAt: string;
    readonly expectedHeadSha?: string;
}
export declare function createWorkflowControlMessage(kind: WorkflowControlKind, jobId: string, expectedHeadSha?: string): WorkflowControlMessage;
//# sourceMappingURL=control.d.ts.map