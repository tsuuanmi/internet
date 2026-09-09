import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowDriver, type WorkflowDriverEngine } from "#internet/workflow/driver";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowState } from "#internet/workflow/types";

const roots: string[] = [];
const sha = "0123456789abcdef0123456789abcdef01234567";

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "internet-driver-"));
	roots.push(value);
	return value;
}

function start(jobs: WorkflowJobStore) {
	return new WorkflowEngine(jobs).start({
		objective: "Drive this workflow",
		repository: "https://github.com/example/repo",
		baseRevision: sha,
		ownerSessionId: "agent-driver",
	});
}

function advance(job: WorkflowJob, state: WorkflowState, event?: string): WorkflowJob {
	return {
		...job,
		revision: job.revision + 1,
		state,
		updatedAt: new Date().toISOString(),
		...(event === undefined
			? {}
			: { lastEvent: { type: event, class: "INTERNAL" as const, at: new Date().toISOString() } }),
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("WorkflowDriver", () => {
	it("drives deterministic phases to the merge-authorization boundary", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		const calls: string[] = [];
		const engine: WorkflowDriverEngine = {
			status: () => current,
			async runResearch() {
				calls.push("research");
				current = advance(current, "RESEARCH_HANDOFFS_DELIVERING");
				return current;
			},
			async runWriterImplementation() {
				calls.push("writer");
				current = advance(current, "PR_OPEN");
				return current;
			},
			async runReview() {
				calls.push("review");
				current = advance(current, "REVIEW_HANDOFFS_DELIVERING");
				return current;
			},
			async runWriterRemediation() {
				calls.push("gate");
				current = advance(current, "READY_FOR_MERGE_AUTHORIZATION", "REVIEW_GATE_PASSED");
				return current;
			},
			async runPrHealthGate() {
				calls.push("health");
				current = {
					...advance(current, "READY_FOR_MERGE_AUTHORIZATION", "PR_HEALTH_PASSED"),
					prHealth: {
						repository: "example/repo",
						number: 1,
						url: "https://github.com/example/repo/pull/1",
						headSha: sha,
						status: "PASS",
						summary: "passed",
						checkedAt: new Date().toISOString(),
					},
					pullRequest: {
						repository: "example/repo",
						number: 1,
						url: "https://github.com/example/repo/pull/1",
						base: "main",
						head: "branch",
						headSha: sha,
					},
				};
				return current;
			},
			requestMergeAuthorization() {
				calls.push("request-merge");
				current = advance(current, "AWAITING_MERGE_AUTHORIZATION");
				return current;
			},
			async runWriterMerge() {
				throw new Error("unexpected merge");
			},
			markRetryRequired() {
				throw new Error("unexpected retry");
			},
			cancel() {
				current = advance(current, "CANCELLED");
				return current;
			},
		};
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(false));
		expect(calls).toEqual(["research", "writer", "review", "gate", "health", "request-merge"]);
		expect(current.state).toBe("AWAITING_MERGE_AUTHORIZATION");
	});

	it("deduplicates concurrent enqueue calls by job id", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const runResearch = vi.fn(async () => {
			await waiting;
			current = advance(current, "FAILED_RETRYABLE");
			return current;
		});
		const engine = {
			status: () => current,
			runResearch,
			markRetryRequired: (_id: string, message: string, resumeState: WorkflowState) => {
				current = {
					...advance(current, "FAILED_RETRYABLE"),
					pendingAction: { kind: "RETRY_REQUIRED" as const, message, resumeState },
				};
				return current;
			},
			cancel: () => current,
		} as unknown as WorkflowDriverEngine;
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(runResearch).toHaveBeenCalledTimes(1));
		release();
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(false));
		expect(runResearch).toHaveBeenCalledTimes(1);
	});

	it("does not auto-resume a rejected merge request after restart discovery", async () => {
		const jobs = new WorkflowJobStore(root());
		const created = start(jobs);
		jobs.update(created.jobId, (job) => ({
			...job,
			revision: job.revision + 1,
			state: "READY_FOR_MERGE_AUTHORIZATION",
			lastEvent: { type: "MERGE_AUTHORIZATION_REJECTED", class: "INTERNAL", at: new Date().toISOString() },
			updatedAt: new Date().toISOString(),
		}));
		const engine = { status: (id: string) => jobs.get(id)! } as unknown as WorkflowDriverEngine;
		const driver = new WorkflowDriver(engine, jobs);
		driver.resumeActive();
		await Promise.resolve();
		expect(driver.isActive(created.jobId)).toBe(false);
	});

	it("records unexpected execution failure as explicit retry-required state", async () => {
		const jobs = new WorkflowJobStore(root());
		const created = start(jobs);
		const engine = new WorkflowEngine(jobs, {
			async run() {
				throw new Error("browser transport failed");
			},
		});
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(created.jobId);
		await vi.waitFor(() => expect(driver.isActive(created.jobId)).toBe(false));
		const failed = engine.status(created.jobId);
		expect(failed.state).toBe("FAILED_RETRYABLE");
		expect(failed.pendingAction).toMatchObject({ kind: "RETRY_REQUIRED", resumeState: "RESEARCH_RUNNING" });
	});

	it("keeps an intentionally aborted research phase resumable across driver disposal", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const created = start(jobs);
		const team = {
			async run(request: { signal?: AbortSignal }) {
				await new Promise<void>((_resolve, reject) => {
					request.signal?.addEventListener(
						"abort",
						() => reject(Object.assign(new Error("shutdown"), { name: "AbortError" })),
						{ once: true },
					);
				});
				throw new Error("unreachable");
			},
		};
		const engine = new WorkflowEngine(jobs, team);
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(created.jobId);
		await vi.waitFor(() => expect(engine.status(created.jobId).state).toBe("RESEARCH_RUNNING"));
		await driver.dispose();
		const persisted = engine.status(created.jobId);
		expect(persisted.state).toBe("RESEARCH_RUNNING");
		expect(persisted.pendingAction).toBeUndefined();
		const restarted = new WorkflowDriver(engine, jobs);
		restarted.resumeActive();
		expect(restarted.isActive(created.jobId)).toBe(true);
		await restarted.dispose();
	});

	it("aborts and settles active work before persisting cancellation", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		let observedAbort = false;
		const engine: WorkflowDriverEngine = {
			status: () => current,
			async runResearch(_id, signal) {
				await new Promise<void>((resolve) =>
					signal?.addEventListener(
						"abort",
						() => {
							observedAbort = true;
							resolve();
						},
						{ once: true },
					),
				);
				return current;
			},
			async runWriterImplementation() {
				return current;
			},
			async runReview() {
				return current;
			},
			async runWriterRemediation() {
				return current;
			},
			async runPrHealthGate() {
				return current;
			},
			requestMergeAuthorization() {
				return current;
			},
			async runWriterMerge() {
				return current;
			},
			markRetryRequired() {
				return current;
			},
			cancel() {
				current = advance(current, "CANCELLED");
				return current;
			},
		};
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(true));
		const cancelled = await driver.cancel(current.jobId);
		expect(observedAbort).toBe(true);
		expect(cancelled.state).toBe("CANCELLED");
		expect(driver.isActive(current.jobId)).toBe(false);
	});
});
