import type { AccountId } from "#internet/core/accounts";
import type { WorkflowGraphSnapshot, WorkflowLifecycle } from "#internet/workflow/graph";
export interface WorkflowAccountRouting {
    readonly thinkerAccounts: readonly [AccountId, AccountId];
    readonly writerAccount: "chatgpt-writer";
    readonly synthesizerAccount: AccountId;
}
export interface WorkflowHandoffReceipt {
    readonly handoffId: string;
    readonly source: string;
    readonly recipient: AccountId;
    readonly sequence: number;
    readonly payloadHash: string;
    readonly status: "pending" | "delivered";
}
export interface WorkflowPullRequestReceipt {
    readonly repository: string;
    readonly number: number;
    readonly url: string;
    readonly base: string;
    readonly head: string;
    readonly headSha: string;
}
export interface WorkflowWriterConversation {
    readonly sessionId: string;
    readonly accountId: "chatgpt-writer";
    readonly url?: string;
}
export declare const WORKFLOW_PENDING_ACTION_KINDS: readonly ["WRITER_BLOCKED", "UNKNOWN_CONFIRMATION", "REVIEW_LIMIT_REACHED", "ACCOUNT_REAUTH_REQUIRED", "USER_ACTION_REQUIRED", "CODE_FIX_REQUIRED"];
export type WorkflowPendingActionKind = (typeof WORKFLOW_PENDING_ACTION_KINDS)[number];
export interface WorkflowPendingAction {
    readonly kind: WorkflowPendingActionKind;
    readonly message: string;
    readonly nodeId?: string;
    readonly expectedHeadSha?: string;
}
export interface WorkflowEventRecord {
    readonly type: string;
    readonly class: "INTERNAL" | "PROGRESS" | "ACTION_REQUIRED";
    readonly at: string;
    readonly message?: string;
    readonly nodeId?: string;
    readonly executionId?: string;
}
export interface WorkflowJob {
    readonly schema: "@tsuuanmi/internet-workflow-job";
    readonly version: 3;
    readonly revision: number;
    readonly jobId: string;
    readonly ownerSessionId: string;
    readonly objective: string;
    readonly repository: string;
    readonly baseRevision: string;
    readonly graph: WorkflowGraphSnapshot;
    readonly accountRouting: WorkflowAccountRouting;
    readonly handoffReceipts: readonly WorkflowHandoffReceipt[];
    readonly writerConversation: WorkflowWriterConversation;
    readonly pullRequest?: WorkflowPullRequestReceipt;
    readonly reviewCycle: number;
    readonly pendingAction?: WorkflowPendingAction;
    readonly lastEvent?: WorkflowEventRecord;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface StartWorkflowInput {
    readonly objective: string;
    readonly repository: string;
    readonly baseRevision: string;
    readonly ownerSessionId: string;
    readonly jobId?: string;
}
export declare const TERMINAL_WORKFLOW_LIFECYCLES: ReadonlySet<WorkflowLifecycle>;
export declare function workflowJobIsTerminal(job: WorkflowJob): boolean;
//# sourceMappingURL=types.d.ts.map