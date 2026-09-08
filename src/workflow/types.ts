import type { AccountId } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
import type { WorkflowReviewVerdict } from "#internet/workflow/review-result";

export const WORKFLOW_STATES = [
	"CREATED",
	"RESEARCH_RUNNING",
	"RESEARCH_HANDOFFS_DELIVERING",
	"WRITER_RUNNING",
	"PR_OPEN",
	"REVIEW_RUNNING",
	"REVIEW_HANDOFFS_DELIVERING",
	"WRITER_REMEDIATING",
	"READY_FOR_MERGE_AUTHORIZATION",
	"AWAITING_MERGE_AUTHORIZATION",
	"MERGING",
	"DONE",
	"BLOCKED",
	"UNKNOWN_CONFIRMATION",
	"FAILED_RETRYABLE",
	"FAILED_TERMINAL",
	"CANCELLED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_TEAM_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type WorkflowTeamStatus = (typeof WORKFLOW_TEAM_STATUSES)[number];

export interface WorkflowTeamResult {
	readonly finalAnswer: string;
	readonly finalAccountId: AccountId;
	readonly finalProvider: WebProvider;
	readonly completedAt: string;
	readonly reviewedHeadSha?: string;
	readonly reviewVerdict?: WorkflowReviewVerdict;
}

export interface WorkflowTeamRun {
	readonly lane: "A" | "B";
	readonly status: WorkflowTeamStatus;
	readonly attempts: number;
	readonly sessionId: string;
	readonly result?: WorkflowTeamResult;
	readonly error?: string;
}

export interface WorkflowAccountRouting {
	readonly thinkerAccounts: readonly ["chatgpt-thinker", "gemini-thinker"];
	readonly writerAccount: "chatgpt-writer";
	readonly synthesizerAccount: "chatgpt-thinker";
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

export interface WorkflowPendingAction {
	readonly kind:
		| "MERGE_AUTHORIZATION_REQUIRED"
		| "WRITER_BLOCKED"
		| "UNKNOWN_CONFIRMATION"
		| "REVIEW_LIMIT_REACHED"
		| "ACCOUNT_REAUTH_REQUIRED";
	readonly message: string;
	readonly expectedHeadSha?: string;
	/** State to resume after a manually handled non-terminal exception. */
	readonly resumeState?: WorkflowState;
}

export interface WorkflowEventRecord {
	readonly type: string;
	readonly class: "INTERNAL" | "PROGRESS" | "ACTION_REQUIRED";
	readonly at: string;
	readonly message?: string;
}

export interface WorkflowJob {
	readonly schema: "@tsuuanmi/internet-workflow-job";
	readonly version: 1;
	readonly revision: number;
	readonly jobId: string;
	readonly objective: string;
	readonly repository: string;
	readonly baseRevision: string;
	readonly state: WorkflowState;
	readonly teamRuns: {
		readonly research: readonly [WorkflowTeamRun, WorkflowTeamRun];
		readonly review: readonly [WorkflowTeamRun, WorkflowTeamRun];
	};
	readonly accountRouting: WorkflowAccountRouting;
	readonly handoffReceipts: readonly WorkflowHandoffReceipt[];
	readonly writerConversation: {
		readonly sessionId: string;
		readonly accountId: "chatgpt-writer";
	};
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
}

export interface WorkflowDecisionInput {
	readonly jobId: string;
	readonly expectedHeadSha?: string;
}

export const TERMINAL_WORKFLOW_STATES: ReadonlySet<WorkflowState> = new Set(["DONE", "FAILED_TERMINAL", "CANCELLED"]);
