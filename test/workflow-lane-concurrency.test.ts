import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner, WorkflowTeamRunRequest } from "#internet/workflow/team-runner";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fixture(runner: WorkflowTeamRunner) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-concurrency-"));
	roots.push(root);
	const jobs = new WorkflowJobStore(root);
	const engine = new WorkflowEngine(jobs, runner, new WorkflowTeamPromptBuilder());
	const job = engine.start({
		objective: "Protect lane concurrency.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "agent",
	});
	return { jobs, engine, job };
}

function deferredRunner(resultFor: (request: WorkflowTeamRunRequest) => string) {
	const started: string[] = [];
	const pending = new Map<string, () => void>();
	const runner: WorkflowTeamRunner = {
		run(request) {
			started.push(request.sessionId);
			return new Promise((resolve) => {
				pending.set(request.sessionId, () =>
					resolve({
						ok: true,
						finalAnswer: resultFor(request),
						finalAccountId: "chatgpt-thinker",
						finalProvider: "chatgpt-web",
					}),
				);
			});
		},
	};
	return { runner, started, pending };
}

describe("workflow lane concurrency", () => {
	it("launches both Research A/B lanes before awaiting either result", async () => {
		const deferred = deferredRunner((request) => `research:${request.sessionId}`);
		const { engine, job } = fixture(deferred.runner);
		const running = engine.runResearch(job.jobId);
		await Promise.resolve();
		expect(deferred.started).toEqual([
			`agent:workflow:${job.jobId}:research:A`,
			`agent:workflow:${job.jobId}:research:B`,
		]);
		expect(engine.status(job.jobId).teamRuns.research.map((run) => run.status)).toEqual(["running", "running"]);
		for (const release of deferred.pending.values()) release();
		await expect(running).resolves.toMatchObject({ state: "RESEARCH_HANDOFFS_DELIVERING" });
	});

	it("launches both Review A/B lanes before awaiting either result", async () => {
		const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const deferred = deferredRunner((request) =>
			request.sessionId.includes(":review:")
				? `{"verdict":"PASS","reviewedHeadSha":"${head}","summary":"clean"}`
				: "research",
		);
		const { jobs, engine, job } = fixture(deferred.runner);
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "PR_OPEN",
			pullRequest: {
				repository: "https://github.com/example/repo",
				number: 1,
				url: "https://github.com/example/repo/pull/1",
				base: "main",
				head: "workflow/test",
				headSha: head,
			},
			updatedAt: "2026-09-09T10:00:00.000Z",
		}));
		const running = engine.runReview(job.jobId);
		await Promise.resolve();
		expect(deferred.started).toEqual([
			`agent:workflow:${job.jobId}:review:A`,
			`agent:workflow:${job.jobId}:review:B`,
		]);
		expect(engine.status(job.jobId).teamRuns.review.map((run) => run.status)).toEqual(["running", "running"]);
		for (const release of deferred.pending.values()) release();
		await expect(running).resolves.toMatchObject({ state: "REVIEW_HANDOFFS_DELIVERING", reviewCycle: 1 });
	});
});
