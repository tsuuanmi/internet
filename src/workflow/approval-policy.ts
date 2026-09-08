import type { AccountId } from "#internet/core/accounts";
import type { WorkflowPullRequestReceipt, WorkflowState } from "#internet/workflow/types";

export const WORKFLOW_CONFIRMATION_ACTIONS = [
	"create_branch",
	"write_file",
	"create_commit",
	"push_branch",
	"create_pull_request",
	"update_pull_request",
	"merge_pull_request",
] as const;

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
}

/** Expected workflow authority plus the actual runtime account/session. */
export interface WorkflowApprovalContext extends WorkflowApprovalScope {
	readonly accountId: AccountId;
	readonly sessionId: string;
}

export type WorkflowConfirmationDecision =
	| { readonly kind: "auto-approve"; readonly action: Exclude<WorkflowConfirmationAction, "merge_pull_request"> }
	| { readonly kind: "merge-requires-user"; readonly reason: string }
	| { readonly kind: "unknown"; readonly reason: string };

/** Domain-level interruption raised when Website confirmation cannot proceed automatically. */
export class WorkflowConfirmationError extends Error {
	readonly kind: WorkflowConfirmationIssue;

	constructor(kind: WorkflowConfirmationIssue, message: string) {
		super(message);
		this.name = "WorkflowConfirmationError";
		this.kind = kind;
	}
}

const IMPLEMENTATION_ACTIONS: ReadonlySet<WorkflowConfirmationAction> = new Set([
	"create_branch",
	"write_file",
	"create_commit",
	"push_branch",
	"create_pull_request",
]);

const REMEDIATION_ACTIONS: ReadonlySet<WorkflowConfirmationAction> = new Set([
	"write_file",
	"create_commit",
	"push_branch",
	"update_pull_request",
]);

const BRANCH_BOUND_ACTIONS: ReadonlySet<WorkflowConfirmationAction> = new Set([
	"create_branch",
	"write_file",
	"create_commit",
	"push_branch",
	"create_pull_request",
	"update_pull_request",
]);

export function workflowWriterBranch(jobId: string): string {
	if (!/^[0-9a-f]{32}$/u.test(jobId)) throw new Error("workflow writer branch requires a valid job id");
	return `internet-workflow/${jobId}`;
}

export function normalizeGitHubRepository(value: string): string | undefined {
	const trimmed = value.trim();
	const url = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/iu);
	if (url) return `${url[1]}/${url[2]}`.toLowerCase();
	const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
	return shorthand ? `${shorthand[1]}/${shorthand[2]}`.toLowerCase() : undefined;
}

function expectedBranch(context: WorkflowApprovalContext): string {
	return context.pullRequest?.head ?? workflowWriterBranch(context.jobId);
}

function allowedActions(state: WorkflowState): ReadonlySet<WorkflowConfirmationAction> | undefined {
	if (state === "WRITER_RUNNING") return IMPLEMENTATION_ACTIONS;
	if (state === "WRITER_REMEDIATING") return REMEDIATION_ACTIONS;
	return undefined;
}

export function classifyWorkflowConfirmation(
	context: WorkflowApprovalContext,
	observation: WorkflowConfirmationObservation,
): WorkflowConfirmationDecision {
	if (context.accountId !== "chatgpt-writer") {
		return { kind: "unknown", reason: "confirmation is not running on the workflow writer account" };
	}
	if (context.sessionId !== context.writerSessionId) {
		return { kind: "unknown", reason: "confirmation session does not match the active writer conversation" };
	}
	if (observation.action === undefined) return { kind: "unknown", reason: "confirmation action is not recognized" };

	const authoritativeRepository = normalizeGitHubRepository(context.repository);
	const observedRepository = observation.repository && normalizeGitHubRepository(observation.repository);
	if (authoritativeRepository === undefined || observedRepository === undefined) {
		return { kind: "unknown", reason: "confirmation repository is missing or unsupported" };
	}
	if (authoritativeRepository !== observedRepository) {
		return { kind: "unknown", reason: "confirmation repository does not match the workflow repository" };
	}
	if (context.pullRequest !== undefined) {
		const pullRequestRepository = normalizeGitHubRepository(context.pullRequest.repository);
		if (pullRequestRepository !== authoritativeRepository) {
			return { kind: "unknown", reason: "persisted pull-request repository does not match workflow authority" };
		}
	}

	if (observation.action === "merge_pull_request") {
		if (context.pullRequest !== undefined) {
			if (observation.prNumber !== undefined && observation.prNumber !== context.pullRequest.number) {
				return { kind: "unknown", reason: "merge confirmation PR number does not match the workflow PR" };
			}
			if (observation.branch !== undefined && observation.branch !== context.pullRequest.head) {
				return { kind: "unknown", reason: "merge confirmation branch does not match the workflow PR head" };
			}
		}
		return { kind: "merge-requires-user", reason: "merge requires explicit user authorization" };
	}

	const allowed = allowedActions(context.state);
	if (allowed === undefined || !allowed.has(observation.action)) {
		return { kind: "unknown", reason: `confirmation action is not permitted from ${context.state}` };
	}
	if (BRANCH_BOUND_ACTIONS.has(observation.action)) {
		if (observation.branch === undefined) {
			return { kind: "unknown", reason: "confirmation branch identity is missing" };
		}
		if (observation.branch !== expectedBranch(context)) {
			return { kind: "unknown", reason: "confirmation branch does not match the workflow branch" };
		}
	}
	if (observation.action === "update_pull_request") {
		if (context.pullRequest === undefined || observation.prNumber === undefined) {
			return { kind: "unknown", reason: "pull-request identity is missing for PR update" };
		}
		if (observation.prNumber !== context.pullRequest.number) {
			return { kind: "unknown", reason: "confirmation PR number does not match the workflow PR" };
		}
	}
	return { kind: "auto-approve", action: observation.action };
}
