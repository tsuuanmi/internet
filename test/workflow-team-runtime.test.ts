import { describe, expect, it } from "vitest";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";

const context = {
	objective: "Fix concurrent account state corruption.",
	repository: "https://github.com/example/repo",
	baseRevision: "0123456789abcdef0123456789abcdef01234567",
} as const;

const pullRequest = {
	repository: "https://github.com/example/repo",
	number: 42,
	url: "https://github.com/example/repo/pull/42",
	base: "main",
	head: "fix/race",
	headSha: "abcdef0123456789abcdef0123456789abcdef01",
} as const;

describe("WorkflowTeamPromptBuilder", () => {
	it("builds distinct deterministic research lane instructions from authoritative context", () => {
		const builder = new WorkflowTeamPromptBuilder();
		const a = builder.research(context, "A");
		const b = builder.research(context, "B");
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
		const prompt = builder.review({ ...context, pullRequest, reviewCycle: 2 }, "B");
		expect(prompt).toContain("https://github.com/example/repo/pull/42");
		expect(prompt).toContain("Review cycle: 2");
		expect(prompt).toContain("abcdef0123456789abcdef0123456789abcdef01");
		expect(prompt).toContain("Review adversarially");
	});
});
