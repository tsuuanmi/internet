import type { WorkflowPullRequestReceipt, WorkflowState } from "#internet/workflow/types";
export declare const WORKFLOW_CONFIRMATION_ACTIONS: readonly ["create_branch", "write_file", "create_commit", "push_branch", "create_pull_request", "update_pull_request", "merge_pull_request"];
export type WorkflowConfirmationAction = (typeof WORKFLOW_CONFIRMATION_ACTIONS)[number];
export interface WorkflowConfirmationObservation {
    readonly action?: WorkflowConfirmationAction;
    readonly repository?: string;
    readonly branch?: string;
    readonly prNumber?: number;
}
export interface WorkflowApprovalContext {
    readonly jobId: string;
    readonly accountId: "chatgpt-writer";
    readonly currentSessionId: string;
    readonly writerSessionId: string;
    readonly repository: string;
    readonly state: WorkflowState;
    readonly pullRequest?: WorkflowPullRequestReceipt;
}
export type WorkflowConfirmationDecision = {
    readonly kind: "auto-approve";
    readonly action: Exclude<WorkflowConfirmationAction, "merge_pull_request">;
} | {
    readonly kind: "merge-requires-user";
    readonly reason: string;
} | {
    readonly kind: "unknown";
    readonly reason: string;
};
export declare function workflowWriterBranch(jobId: string): string;
export declare function normalizeGitHubRepository(value: string): string | undefined;
export declare function classifyWorkflowConfirmation(context: WorkflowApprovalContext, observation: WorkflowConfirmationObservation): WorkflowConfirmationDecision;
//# sourceMappingURL=approval-policy.d.ts.map