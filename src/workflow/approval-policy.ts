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

export type WorkflowConfirmationDecision =
	| { readonly kind: "auto-approve"; readonly action: Exclude<WorkflowConfirmationAction, "merge_pull_request"> }
	| { readonly kind: "merge-requires-user"; readonly reason: string }
	| { readonly kind: "unknown"; readonly reason: string };

const IMPLEMENTATION_ACTIONS = new Set<WorkflowConfirmationAction>([
	"create_branch",
	"write_file",
	"create_commit",
	"push_branch",
	"create_pull_request",
]);

const REMEDIATION_ACTIONS = new Set<WorkflowConfirmationAction>([
	"write_file",
	"create_commit",
	"push_branch",
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

function branchBound(action: WorkflowConfirmationAction): boolean {
	return new Set<WorkflowConfirmationAction>([
		"create_branch",
		"write_file",
		"create_commit",
		"push_branch",
		"create_pull_request",
		"update_pull_request",
	]).has(action);
}

export function classifyWorkflowConfirmation(
	context: WorkflowApprovalContext,
	observation: WorkflowConfirmationObservation,
): WorkflowConfirmationDecision {
	if (context.accountId !== "chatgpt-writer") return { kind: "unknown", reason: "confirmation is not on the writer account" };
	if (context.currentSessionId !== context.writerSessionId) {
		return { kind: "unknown", reason: "confirmation session does not match the active writer conversation" };
	}
	if (observation.action === undefined) return { kind: "unknown", reason: "confirmation action is not recognized" };
	if (observation.action === "merge_pull_request") {
		return { kind: "merge-requires-user", reason: "merge is never auto-authorized by the implementation policy" };
	}
	const authoritativeRepository = normalizeGitHubRepository(context.repository);
	const observedRepository = observation.repository && normalizeGitHubRepository(observation.repository);
	if (authoritativeRepository === undefined || observedRepository === undefined) {
		return { kind: "unknown", reason: "confirmation repository is missing or unsupported" };
	}
	if (authoritativeRepository !== observedRepository) {
		return { kind: "unknown", reason: "confirmation repository does not match the workflow repository" };
	}
	const allowed =
		context.state === "WRITER_RUNNING"
			? IMPLEMENTATION_ACTIONS
			: context.state === "WRITER_REMEDIATING"
				? REMEDIATION_ACTIONS
				: undefined;
	if (allowed === undefined || !allowed.has(observation.action)) {
		return { kind: "unknown", reason: `confirmation action is not permitted from ${context.state}` };
	}
	if (branchBound(observation.action)) {
		if (observation.branch === undefined) return { kind: "unknown", reason: "confirmation branch identity is missing" };
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
