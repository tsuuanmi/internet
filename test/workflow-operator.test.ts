import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowOperator } from "#internet/workflow/operator";
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
	const operator = new WorkflowOperator(engine, driver, jobs, traces);
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

	it("renders exact failed provider turn from durable trace", () => {
		const { jobs, traces, engine, operator } = fixture();
		const job = start(engine, "Fix Gemini provider failure");
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
						error: "Gemini failed to execute the newest response; retry the provider turn",
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
			at: "2026-09-09T10:00:01.000Z",
			stage: "provider_turn",
			status: "failed",
			round: 2,
			accountId: "gemini-thinker",
			provider: "gemini-web",
			kind: "provider_error",
			message: "Gemini failed to execute the newest response; retry the provider turn",
			retryable: true,
		});
		const output = operator.status("owner", job.jobId);
		expect(output).toContain("A  FAILED  attempt 1");
		expect(output).toContain("round 2 · gemini-thinker · provider_turn · FAILED · provider_error");
		expect(output).toContain("ACTION REQUIRED: RETRY_REQUIRED");
	});

	it("stops active work through the driver and reports CANCELLED", async () => {
		const { engine, driver, operator } = fixture();
		const job = start(engine, "Stop me");
		await expect(operator.stop("owner", job.jobId)).resolves.toContain("State: CANCELLED");
		expect(driver.cancel).toHaveBeenCalledWith(job.jobId);
		expect(engine.status(job.jobId).state).toBe("CANCELLED");
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
