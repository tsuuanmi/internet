import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";

const roots: string[] = [];

function engine() {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-"));
	roots.push(root);
	const store = new WorkflowJobStore(root);
	return { root, store, engine: new WorkflowEngine(store) };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowEngine", () => {
	it("creates a durable account-routed job with deterministic lane identities", () => {
		const { root, engine: workflow } = engine();
		const job = workflow.start({
			objective: "Fix the race.",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "agent-7",
		});

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
		expect(job.writerConversation).toEqual({
			accountId: "chatgpt-writer",
			sessionId: `agent-7:workflow:${job.jobId}:writer`,
		});
		const path = join(root, "workflows", "jobs", `${job.jobId}.json`);
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ jobId: job.jobId, version: 1, revision: 1 });
		if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("persists cancellation and increments the durable revision", () => {
		const { engine: workflow } = engine();
		const created = workflow.start({
			objective: "Refactor it",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "agent",
		});
		const cancelled = workflow.cancel(created.jobId);
		expect(cancelled.state).toBe("CANCELLED");
		expect(cancelled.revision).toBe(2);
		expect(workflow.status(created.jobId)).toEqual(cancelled);
		expect(() => workflow.cancel(created.jobId)).toThrow(/already terminal/u);
	});

	it("rejects permission-weakened durable state", () => {
		const { store, engine: workflow } = engine();
		const created = workflow.start({
			objective: "Refactor it",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "agent",
		});
		if (process.platform === "win32") return;
		chmodSync(store.pathFor(created.jobId), 0o644);
		expect(() => workflow.status(created.jobId)).toThrow(/permissions must be 0600/u);
	});
});
