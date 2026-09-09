import type { AccountId } from "#internet/core/accounts";
import type { WorkflowMergeAuthorization, WorkflowPullRequestReceipt, WorkflowState } from "#internet/workflow/types";
export declare const WORKFLOW_CONFIRMATION_ACTIONS: readonly ["create_branch", "write_file", "create_commit", "push_branch", "create_pull_request", "update_pull_request", "merge_pull_request"];
export type WorkflowConfirmationAction = (typeof WORKFLOW_CONFIRMATION_ACTIONS)[number];
export type WorkflowConfirmationIssue = "unknown" | "merge-requires-user";
export interface WorkflowConfirmationObservation {
    readonly action?: WorkflowConfirmationAction;
    readonly repository?: string;
    readonly branch?: string;
    readonly prNumber?: number;
}
/** Expected workflow authority passed into the browser runtime. */
export interface WorkflowApprovalScope {
    readonly jobId: string;
    readonly writerSessionId: string;
    readonly repository: string;
    readonly state: WorkflowState;
    readonly pullRequest?: WorkflowPullRequestReceipt;
    readonly mergeAuthorization?: WorkflowMergeAuthorization;
}
/** Expected workflow authority plus the actual runtime account/session. */
export interface WorkflowApprovalContext extends WorkflowApprovalScope {
    readonly accountId: AccountId;
    readonly sessionId: string;
}
export type WorkflowConfirmationDecision = {
    readonly kind: "auto-approve";
    readonly action: WorkflowConfirmationAction;
} | {
    readonly kind: "merge-requires-user";
    readonly reason: string;
} | {
    readonly kind: "unknown";
    readonly reason: string;
};
/** Domain-level interruption raised when Website confirmation cannot proceed automatically. */
export declare class WorkflowConfirmationError extends Error {
    readonly kind: WorkflowConfirmationIssue;
    constructor(kind: WorkflowConfirmationIssue, message: string);
}
export declare function workflowWriterBranch(jobId: string): string;
export declare function normalizeGitHubRepository(value: string): string | undefined;
export declare function classifyWorkflowConfirmation(context: WorkflowApprovalContext, observation: WorkflowConfirmationObservation): WorkflowConfirmationDecision;
//# sourceMappingURL=approval-policy.d.ts.map