import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowWriterResult, WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const roots: string[] = [];
const sha = "0123456789abcdef0123456789abcdef01234567";

function root() {
	const value = mkdtempSync(join(tmpdir(), "internet-ci-"));
	roots.push(value);
	return value;
}
afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

function ready(writerResult: WorkflowWriterResult) {
	const jobs = new WorkflowJobStore(root());
	const writer: WorkflowWriterRunner = {
		async deliverExact() {},
		async runControl() {
			return writerResult;
		},
	};
	const engine = new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
	const created = engine.start({
		objective: "x",
		repository: "https://github.com/example/repo",
		baseRevision: sha,
		ownerSessionId: "agent",
	});
	jobs.update(created.jobId, (job) => ({
		...job,
		revision: job.revision + 1,
		state: "READY_FOR_MERGE_AUTHORIZATION",
		pullRequest: {
			repository: job.repository,
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			base: "main",
			head: "internet-workflow/x",
			headSha: sha,
		},
		teamRuns: {
			...job.teamRuns,
			review: job.teamRuns.review.map((run) => ({
				...run,
				status: "completed",
				result: {
					finalAnswer: "{}",
					finalAccountId: "chatgpt-thinker",
					finalProvider: "chatgpt-web",
					completedAt: new Date().toISOString(),
					reviewedHeadSha: sha,
					reviewVerdict: "PASS",
				},
			})) as never,
		},
		updatedAt: new Date().toISOString(),
	}));
	return { engine, jobId: created.jobId };
}

describe("exact-head PR health gate", () => {
	it("persists PASS and allows merge authorization", async () => {
		const { engine, jobId } = ready({
			status: "PR_HEALTH",
			repository: "https://github.com/example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha: sha,
			health: "PASS",
		});
		const checked = await engine.runPrHealthCheck(jobId);
		expect(checked.ciReceipt).toMatchObject({ status: "PASS", headSha: sha });
		expect(engine.requestMergeAuthorization(jobId).state).toBe("AWAITING_MERGE_AUTHORIZATION");
	});

	it("treats NONE as eligible but UNKNOWN as action-required", async () => {
		const none = ready({
			status: "PR_HEALTH",
			repository: "https://github.com/example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha: sha,
			health: "NONE",
		});
		await none.engine.runPrHealthCheck(none.jobId);
		expect(none.engine.requestMergeAuthorization(none.jobId).pendingAction?.message).toContain("ci=NONE");
		const unknown = ready({
			status: "PR_HEALTH",
			repository: "https://github.com/example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha: sha,
			health: "UNKNOWN",
		});
		const blocked = await unknown.engine.runPrHealthCheck(unknown.jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pendingAction?.kind).toBe("CI_HEALTH_UNKNOWN");
	});

	it("preserves unknown Website confirmation as its own fail-closed boundary", async () => {
		const { engine, jobId } = ready({ status: "UNKNOWN_CONFIRMATION", message: "unexpected GitHub confirmation" });
		const blocked = await engine.runPrHealthCheck(jobId);
		expect(blocked.state).toBe("UNKNOWN_CONFIRMATION");
		expect(blocked.pendingAction).toMatchObject({
			kind: "UNKNOWN_CONFIRMATION",
			resumeState: "READY_FOR_MERGE_AUTHORIZATION",
		});
		expect(blocked.mergeAuthorization).toBeUndefined();
	});

	it("keeps pending checks retryable and rejects stale-head health", async () => {
		const pending = ready({
			status: "PR_HEALTH",
			repository: "https://github.com/example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha: sha,
			health: "PENDING",
		});
		const wait = await pending.engine.runPrHealthCheck(pending.jobId);
		expect(wait.state).toBe("FAILED_RETRYABLE");
		expect(wait.pendingAction).toMatchObject({
			kind: "RETRY_REQUIRED",
			resumeState: "READY_FOR_MERGE_AUTHORIZATION",
		});
		const stale = ready({
			status: "PR_HEALTH",
			repository: "https://github.com/example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha: "abcdef0123456789abcdef0123456789abcdef01",
			health: "PASS",
		});
		const blocked = await stale.engine.runPrHealthCheck(stale.jobId);
		expect(blocked.state).toBe("BLOCKED");
	});
});
