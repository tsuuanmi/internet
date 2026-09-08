import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowTeamRunRequest, WorkflowTeamRunner } from "#internet/workflow/team-runner";

const roots: string[] = [];

function fixture(runner?: WorkflowTeamRunner) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-"));
	roots.push(root);
	const store = new WorkflowJobStore(root);
	return { root, store, engine: new WorkflowEngine(store, runner) };
}

function start(workflow: WorkflowEngine) {
	return workflow.start({
		objective: "Fix the race.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "agent-7",
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowEngine", () => {
	it("creates a durable account-routed job with deterministic lane identities", () => {
		const { root, engine: workflow } = fixture();
		const job = start(workflow);

		expect(job.jobId).toMatch(/^[0-9a-f]{32}$/u);
		expect(job.state).toBe("CREATED");
		expect(job.accountRouting).toEqual({
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		});
		expect(job.teamRuns.research.map((run) => run.sessionId)).toEqual([
			`agent-7:workflow:${job.jobId}:research:A`,
			`agent-7:workflow:${job.jobId}:research:B`,
		]);
		expect(job.teamRuns.review.map((run) => run.sessionId)).toEqual([
			`agent-7:workflow:${job.jobId}:review:A`,
			`agent-7:workflow:${job.jobId}:review:B`,
		]);
		expect(job.writerConversation).toEqual({
			accountId: "chatgpt-writer",
			sessionId: `agent-7:workflow:${job.jobId}:writer`,
		});
		const path = join(root, "workflows", "jobs", `${job.jobId}.json`);
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ jobId: job.jobId, version: 1, revision: 1 });
		if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("runs research lanes logically concurrently and persists both final results", async () => {
		const pending = new Map<string, () => void>();
		const started: string[] = [];
		const runner: WorkflowTeamRunner = {
			run: (request: WorkflowTeamRunRequest) => {
				started.push(request.sessionId);
				return new Promise((resolve) => {
					pending.set(request.sessionId, () =>
						resolve({
							ok: true,
							finalAnswer: `answer:${request.sessionId}`,
							finalAccountId: "chatgpt-thinker",
							finalProvider: "chatgpt-web",
						}),
					);
				});
			},
		};
		const { engine: workflow } = fixture(runner);
		const job = start(workflow);
		const running = workflow.runResearch(job.jobId);
		await Promise.resolve();
		expect(started).toEqual([
			`agent-7:workflow:${job.jobId}:research:A`,
			`agent-7:workflow:${job.jobId}:research:B`,
		]);
		expect(workflow.status(job.jobId).teamRuns.research.map((run) => run.status)).toEqual(["running", "running"]);
		for (const release of pending.values()) release();
		const completed = await running;
		expect(completed.state).toBe("RESEARCH_HANDOFFS_DELIVERING");
		expect(completed.teamRuns.research.map((run) => run.status)).toEqual(["completed", "completed"]);
		expect(completed.teamRuns.research.every((run) => run.result?.finalAnswer.startsWith("answer:") === true)).toBe(true);
	});

	it("retries only the failed research lane", async () => {
		let laneBFailures = 1;
		const calls: string[] = [];
		const runner: WorkflowTeamRunner = {
			async run(request) {
				calls.push(request.sessionId);
				if (request.sessionId.endsWith(":B") && laneBFailures-- > 0) {
					return { ok: false, error: "temporary failure", failedAccountId: "gemini-thinker", failedProvider: "gemini-web" };
				}
				return { ok: true, finalAnswer: "done", finalAccountId: "chatgpt-thinker", finalProvider: "chatgpt-web" };
			},
		};
		const { engine: workflow } = fixture(runner);
		const job = start(workflow);
		const first = await workflow.runResearch(job.jobId);
		expect(first.state).toBe("FAILED_RETRYABLE");
		expect(first.teamRuns.research.map((run) => [run.lane, run.status, run.attempts])).toEqual([
			["A", "completed", 1],
			["B", "failed", 1],
		]);
		const second = await workflow.runResearch(job.jobId);
		expect(second.state).toBe("RESEARCH_HANDOFFS_DELIVERING");
		expect(second.teamRuns.research.map((run) => [run.lane, run.status, run.attempts])).toEqual([
			["A", "completed", 1],
			["B", "completed", 2],
		]);
		expect(calls.filter((sessionId) => sessionId.endsWith(":A"))).toHaveLength(1);
		expect(calls.filter((sessionId) => sessionId.endsWith(":B"))).toHaveLength(2);
	});

	it("persists cancellation and increments the durable revision", () => {
		const { engine: workflow } = fixture();
		const created = start(workflow);
		const cancelled = workflow.cancel(created.jobId);
		expect(cancelled.state).toBe("CANCELLED");
		expect(cancelled.revision).toBe(2);
		expect(workflow.status(created.jobId)).toEqual(cancelled);
		expect(() => workflow.cancel(created.jobId)).toThrow(/already terminal/u);
	});

	it("rejects permission-weakened durable state", () => {
		const { store, engine: workflow } = fixture();
		const created = start(workflow);
		if (process.platform === "win32") return;
		chmodSync(store.pathFor(created.jobId), 0o644);
		expect(() => workflow.status(created.jobId)).toThrow(/permissions must be 0600/u);
	});
});
