import { describe, expect, it } from "vitest";
import {
	classifyWorkflowConfirmation,
	normalizeGitHubRepository,
	type WorkflowApprovalContext,
	workflowWriterBranch,
} from "#internet/workflow/approval-policy";

const jobId = "0123456789abcdef0123456789abcdef";
const writerSession = `agent:workflow:${jobId}:writer`;

function context(overrides: Partial<WorkflowApprovalContext> = {}): WorkflowApprovalContext {
	return {
		jobId,
		accountId: "chatgpt-writer",
		sessionId: writerSession,
		writerSessionId: writerSession,
		repository: "https://github.com/Example/Repo",
		authority: "IMPLEMENTATION",
		...overrides,
	};
}

describe("workflow scoped approval policy", () => {
	it("normalizes supported GitHub repository identities", () => {
		expect(normalizeGitHubRepository("https://github.com/Example/Repo.git")).toBe("example/repo");
		expect(normalizeGitHubRepository("Example/Repo")).toBe("example/repo");
		expect(normalizeGitHubRepository("https://gitlab.com/example/repo")).toBeUndefined();
	});

	it("auto-approves only exact writer job/repository/branch scoped implementation actions", () => {
		const branch = workflowWriterBranch(jobId);
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "create_branch",
				repository: "example/repo",
				branch,
			}),
		).toEqual({ kind: "auto-approve", action: "create_branch" });
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "write_file",
				repository: "example/repo",
				branch,
			}),
		).toEqual({ kind: "auto-approve", action: "write_file" });
	});

	it("fails closed on actual account, session, repository, branch, action, and authority mismatches", () => {
		const branch = workflowWriterBranch(jobId);
		expect(
			classifyWorkflowConfirmation(context({ accountId: "chatgpt-thinker" }), {
				action: "create_commit",
				repository: "example/repo",
				branch,
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context({ sessionId: "other" }), {
				action: "create_commit",
				repository: "example/repo",
				branch,
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "create_commit",
				repository: "other/repo",
				branch,
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "create_commit",
				repository: "example/repo",
				branch: "wrong",
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context({ authority: "MERGE" }), {
				action: "push_branch",
				repository: "example/repo",
				branch,
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "update_pull_request",
				repository: "example/repo",
				branch,
				prNumber: 5,
			}).kind,
		).toBe("unknown");
	});

	it("requires exact persisted PR authority for remediation updates", () => {
		const pr = {
			repository: "example/repo",
			number: 9,
			url: "https://github.com/example/repo/pull/9",
			base: "main",
			head: "internet-workflow/remediation",
			headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		} as const;
		const remediation = context({ authority: "REMEDIATION", pullRequest: pr });
		expect(
			classifyWorkflowConfirmation(remediation, {
				action: "update_pull_request",
				repository: "example/repo",
				branch: pr.head,
				prNumber: 9,
			}),
		).toEqual({ kind: "auto-approve", action: "update_pull_request" });
		expect(
			classifyWorkflowConfirmation(remediation, {
				action: "update_pull_request",
				repository: "example/repo",
				branch: pr.head,
				prNumber: 10,
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(
				context({ authority: "REMEDIATION", pullRequest: { ...pr, repository: "other/repo" } }),
				{ action: "update_pull_request", repository: "example/repo", branch: pr.head, prNumber: 9 },
			).kind,
		).toBe("unknown");
	});

	it("requires repository scope before classifying merge as user-owned", () => {
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "merge_pull_request",
				repository: "other/repo",
			}).kind,
		).toBe("unknown");
		expect(
			classifyWorkflowConfirmation(context(), {
				action: "merge_pull_request",
				repository: "example/repo",
			}).kind,
		).toBe("merge-requires-user");
	});
});
