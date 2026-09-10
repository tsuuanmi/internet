import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowOperator } from "#internet/workflow/operator";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";

const roots: string[] = [];

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-operator-"));
	roots.push(root);
	const jobs = new WorkflowJobStore(root);
	const traces = new WorkflowTeamTraceStore(root);
	const engine = new WorkflowEngine(jobs);
	const driver = {
		enqueue: vi.fn(),
		isActive: vi.fn(() => false),
		cancel: vi.fn(async (jobId: string) => engine.cancel(jobId)),
	};
	const retention = new WorkflowRetentionManager(root, jobs);
	const operator = new WorkflowOperator(engine, driver, jobs, traces, retention);
	return { jobs, traces, engine, driver, operator };
}

function start(engine: WorkflowEngine, objective: string, ownerSessionId = "owner") {
	return engine.start({
		objective,
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId,
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowOperator", () => {
	it("lists only current-owner jobs newest first", () => {
		const { engine, operator } = fixture();
		const first = start(engine, "First");
		const second = start(engine, "Second");
		start(engine, "Other owner", "other");
		const output = operator.list("owner");
		expect(output).toContain(first.jobId);
		expect(output).toContain(second.jobId);
		expect(output).not.toContain("Other owner");
		expect(output.indexOf(second.jobId)).toBeLessThan(output.indexOf(first.jobId));
	});

	it("requires an explicit job id when multiple active jobs are ambiguous", () => {
		const { engine, operator } = fixture();
		const a = start(engine, "A");
		const b = start(engine, "B");
		expect(() => operator.status("owner")).toThrow(/multiple active workflows/u);
		expect(operator.status("owner", a.jobId)).toContain(`Workflow ${a.jobId}`);
		expect(operator.status("owner", b.jobId)).toContain(`Workflow ${b.jobId}`);
	});

	it("renders current pipeline, team/member step, and backing provider only as failure diagnostics", () => {
		const { jobs, traces, engine, operator } = fixture();
		const job = start(engine, "Fix provider failure");
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "FAILED_RETRYABLE",
			teamRuns: {
				...current.teamRuns,
				research: [
					{
						...current.teamRuns.research[0],
						status: "failed",
						attempts: 1,
						error: "Provider failed to execute the newest response",
					},
					current.teamRuns.research[1],
				],
			},
			pendingAction: {
				kind: "RETRY_REQUIRED",
				message: "retry failed lane",
				resumeState: "RESEARCH_RUNNING",
			},
			updatedAt: "2026-09-09T10:01:00.000Z",
		}));
		traces.begin(job.jobId, "research", "A", "2026-09-09T10:00:00.000Z");
		traces.append(job.jobId, {
			phase: "research",
			lane: "A",
			attempt: 1,
			at: "2026-09-09T10:00:00.500Z",
			stage: "provider_turn",
			status: "completed",
			round: 2,
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
		});
		traces.append(job.jobId, {
			phase: "research",
			lane: "A",
			attempt: 1,
			at: "2026-09-09T10:00:01.000Z",
			stage: "provider_turn",
			status: "failed",
			round: 2,
			accountId: "chatgpt-thinker-2",
			provider: "chatgpt-web",
			kind: "provider_error",
			message: "Provider failed to execute the newest response",
			retryable: true,
		});
		const output = operator.status("owner", job.jobId);
		expect(output).toContain("Current: Research · retry required");
		expect(output).toContain("Research  Team A=failed · Team B=pending");
		expect(output).toContain("Team A — FAILED (attempt 1)");
		expect(output).toContain("Step: round 2 · Member 2 · provider turn · FAILED · provider_error");
		expect(output).toContain("Members: Member 1=completed round 2 · Member 2=failed round 2");
		expect(output).toContain("Error: provider_error · retryable");
		expect(output).toContain("Diagnostic: chatgpt-thinker-2 · chatgpt-web");
		expect(output).toContain("ACTION REQUIRED: RETRY_REQUIRED");
	});

	it("watch explains the exact live progress dimensions", () => {
		const { engine, operator } = fixture();
		const job = start(engine, "Watch me");
		const output = operator.watch("owner", job.jobId);
		expect(output).toContain("Pipeline");
		expect(output).toContain("Team A=pending · Team B=pending");
		expect(output).toContain("phase, Team A/B, attempt, round, Member 1/2, stage, and structured failures");
	});

	it("stops active work through the driver and reports CANCELLED", async () => {
		const { engine, driver, operator } = fixture();
		const job = start(engine, "Stop me");
		await expect(operator.stop("owner", job.jobId)).resolves.toContain("State: CANCELLED");
		expect(driver.cancel).toHaveBeenCalledWith(job.jobId);
		expect(engine.status(job.jobId).state).toBe("CANCELLED");
	});

	it("deletes one exact workflow id after cancelling active work", async () => {
		const { jobs, traces, engine, driver, operator } = fixture();
		const job = start(engine, "Delete me");
		traces.append(job.jobId, {
			phase: "research",
			lane: "A",
			attempt: 1,
			at: "2026-09-09T10:00:00.000Z",
			stage: "team",
			status: "started",
		});
		await expect(operator.delete("owner", job.jobId)).resolves.toContain(`Workflow ${job.jobId} deleted.`);
		expect(driver.cancel).toHaveBeenCalledWith(job.jobId);
		expect(jobs.get(job.jobId)).toBeUndefined();
		expect(traces.list(job.jobId)).toEqual([]);
	});

	it("continues only an explicit durable recovery path", () => {
		const { jobs, engine, driver, operator } = fixture();
		const job = start(engine, "Retry me");
		expect(() => operator.continue("owner", job.jobId)).toThrow(/no explicit retry\/recovery path/u);
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "FAILED_RETRYABLE",
			pendingAction: {
				kind: "RETRY_REQUIRED",
				message: "retry",
				resumeState: "RESEARCH_RUNNING",
			},
			updatedAt: "2026-09-09T10:01:00.000Z",
		}));
		expect(operator.continue("owner", job.jobId)).toContain("RESEARCH_RUNNING");
		expect(driver.enqueue).toHaveBeenCalledWith(job.jobId);
	});
});
