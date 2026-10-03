import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";

const roots: string[] = [];

function workflow(): WorkflowEngine {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-freshness-"));
	roots.push(root);
	return new WorkflowEngine(new WorkflowJobStore(root));
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workflow session freshness", () => {
	it("creates disjoint job-scoped website sessions for repeated workflow starts", () => {
		const engine = workflow();
		const input = {
			objective: "Fix the race.",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "agent-7",
		};
		const first = engine.start(input);
		const second = engine.start(input);

		expect(first.jobId).not.toBe(second.jobId);
		const firstResearch = new Set(first.teamRuns.research.map((run) => run.sessionId));
		const secondResearch = second.teamRuns.research.map((run) => run.sessionId);
		expect(secondResearch.every((sessionId) => !firstResearch.has(sessionId))).toBe(true);
		const firstReview = new Set(first.teamRuns.review.map((run) => run.sessionId));
		const secondReview = second.teamRuns.review.map((run) => run.sessionId);
		expect(secondReview.every((sessionId) => !firstReview.has(sessionId))).toBe(true);
		expect(first.writerConversation.sessionId).not.toBe(second.writerConversation.sessionId);
	});
});
