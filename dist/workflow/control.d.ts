export declare const WORKFLOW_CONTROL_KINDS: readonly ["START_IMPLEMENTATION", "APPLY_REVIEWS", "RETRY", "CHECK_PR_HEALTH", "MERGE_AUTHORIZED"];
export type WorkflowControlKind = (typeof WORKFLOW_CONTROL_KINDS)[number];
/** Trusted control-plane message. Never embed model handoff payloads here. */
export interface WorkflowControlMessage {
    readonly kind: WorkflowControlKind;
    readonly jobId: string;
    readonly createdAt: string;
    readonly expectedHeadSha?: string;
}
export declare function createWorkflowControlMessage(kind: WorkflowControlKind, jobId: string, expectedHeadSha?: string): WorkflowControlMessage;
//# sourceMappingURL=control.d.ts.map