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

	it("auto-approves exact implementation actions on the workflow branch", () => {
		const branch = workflowWriterBranch(jobId);
		for (const action of ["create_branch", "write_file", "create_commit", "push_branch", "create_pull_request"] as const) {
			expect(classifyWorkflowConfirmation(context(), { action, repository: "example/repo", branch })).toEqual({
				kind: "auto-approve",
				action,
			});
		}
	});

	it("fails closed on account, session, repository, branch, and out-of-scope actions", () => {
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
			classifyWorkflowConfirmation(context(), {
				action: "merge_pull_request",
				repository: "example/repo",
				branch,
			}).kind,
		).toBe("unknown");
	});

	it("auto-approves only the exact persisted PR update during remediation", () => {
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
	});
});
