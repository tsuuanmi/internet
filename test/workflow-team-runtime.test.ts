import { describe, expect, it } from "vitest";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowJob } from "#internet/workflow/types";

function job(): WorkflowJob {
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId: "0123456789abcdef0123456789abcdef",
		ownerSessionId: "agent",
		objective: "Fix concurrent account state corruption.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		state: "PR_OPEN",
		teamRuns: {
			research: [
				{ lane: "A", status: "pending", attempts: 0, sessionId: "research:A" },
				{ lane: "B", status: "pending", attempts: 0, sessionId: "research:B" },
			],
			review: [
				{ lane: "A", status: "pending", attempts: 0, sessionId: "review:A" },
				{ lane: "B", status: "pending", attempts: 0, sessionId: "review:B" },
			],
		},
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		},
		handoffReceipts: [],
		writerConversation: { sessionId: "writer", accountId: "chatgpt-writer" },
		pullRequest: {
			repository: "https://github.com/example/repo",
			number: 42,
			url: "https://github.com/example/repo/pull/42",
			base: "main",
			head: "fix/race",
			headSha: "abcdef0123456789abcdef0123456789abcdef01",
		},
		reviewCycle: 2,
		createdAt: "2026-09-08T00:00:00.000Z",
		updatedAt: "2026-09-08T00:00:00.000Z",
	};
}

describe("WorkflowTeamPromptBuilder", () => {
	it("builds distinct deterministic research lane instructions from authoritative job state", () => {
		const builder = new WorkflowTeamPromptBuilder();
		const a = builder.research(job(), "A");
		const b = builder.research(job(), "B");
		for (const prompt of [a, b]) {
			expect(prompt).toContain("https://github.com/example/repo");
			expect(prompt).toContain("0123456789abcdef0123456789abcdef01234567");
			expect(prompt).toContain("Fix concurrent account state corruption.");
			expect(prompt).toContain("implementation-ready final answer");
		}
		expect(a).not.toBe(b);
		expect(a).toContain("architecture");
		expect(b).toContain("failure modes");
	});

	it("binds review prompts to the exact PR head and cycle while keeping lane identity external", () => {
		const builder = new WorkflowTeamPromptBuilder();
		const prompt = builder.review(job(), "B");
		expect(prompt).toContain("https://github.com/example/repo/pull/42");
		expect(prompt).toContain("Review cycle: 2");
		expect(prompt).toContain("abcdef0123456789abcdef0123456789abcdef01");
		expect(prompt).toContain("Review adversarially");
	});
});
