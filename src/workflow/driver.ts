import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { TERMINAL_WORKFLOW_STATES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";

export interface WorkflowDriverEngine {
	status(jobId: string): WorkflowJob;
	runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runWriterImplementation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runReview(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runPrHealthGate(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	requestMergeAuthorization(jobId: string): WorkflowJob;
	runWriterMerge(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	markRetryRequired(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob;
	cancel(jobId: string): WorkflowJob;
}

interface ActiveRun {
	readonly controller: AbortController;
	readonly promise: Promise<void>;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function shouldResume(job: WorkflowJob): boolean {
	if (job.state === "READY_FOR_MERGE_AUTHORIZATION") {
		return job.lastEvent?.type !== "MERGE_AUTHORIZATION_REJECTED";
	}
	return new Set<WorkflowState>([
		"CREATED",
		"RESEARCH_RUNNING",
		"RESEARCH_HANDOFFS_DELIVERING",
		"WRITER_RUNNING",
		"PR_OPEN",
		"REVIEW_RUNNING",
		"REVIEW_HANDOFFS_DELIVERING",
		"WRITER_REMEDIATING",
		"MERGING",
	]).has(job.state);
}

/** Deterministic background driver over WorkflowEngine primitives. It never decides implementation content. */
export class WorkflowDriver {
	private readonly engine: WorkflowDriverEngine;
	private readonly jobs: WorkflowJobStore;
	private readonly active = new Map<string, ActiveRun>();
	private disposed = false;

	constructor(engine: WorkflowDriverEngine, jobs: WorkflowJobStore) {
		this.engine = engine;
		this.jobs = jobs;
	}

	isActive(jobId: string): boolean {
		return this.active.has(jobId);
	}

	enqueue(jobId: string): void {
		if (this.disposed || this.active.has(jobId)) return;
		const controller = new AbortController();
		const promise = this.drive(jobId, controller.signal)
			.catch((error: unknown) => {
				if (isAbort(error, controller.signal)) return;
				try {
					const current = this.engine.status(jobId);
					if (TERMINAL_WORKFLOW_STATES.has(current.state)) return;
					this.engine.markRetryRequired(
						jobId,
						`automatic workflow driver failed: ${error instanceof Error ? error.message : String(error)}`,
						current.state,
					);
				} catch {
					// Durable-state failure cannot be repaired safely by the driver itself.
				}
			})
			.finally(() => {
				const current = this.active.get(jobId);
				if (current?.promise === promise) this.active.delete(jobId);
			});
		this.active.set(jobId, { controller, promise });
	}

	resumeActive(): void {
		if (this.disposed) return;
		for (const job of this.jobs.list()) {
			if (shouldResume(job)) this.enqueue(job.jobId);
		}
	}

	async cancel(jobId: string): Promise<WorkflowJob> {
		const run = this.active.get(jobId);
		if (run !== undefined) {
			run.controller.abort();
			await run.promise;
		}
		return this.engine.cancel(jobId);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const runs = [...this.active.values()];
		for (const run of runs) run.controller.abort();
		await Promise.allSettled(runs.map((run) => run.promise));
		this.active.clear();
	}

	private async drive(jobId: string, signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			const before = this.engine.status(jobId);
			let after: WorkflowJob;
			switch (before.state) {
				case "CREATED":
				case "RESEARCH_RUNNING":
					after = await this.engine.runResearch(jobId, signal);
					break;
				case "RESEARCH_HANDOFFS_DELIVERING":
				case "WRITER_RUNNING":
					after = await this.engine.runWriterImplementation(jobId, signal);
					break;
				case "PR_OPEN":
				case "REVIEW_RUNNING":
					after = await this.engine.runReview(jobId, signal);
					break;
				case "REVIEW_HANDOFFS_DELIVERING":
				case "WRITER_REMEDIATING":
					after = await this.engine.runWriterRemediation(jobId, signal);
					break;
				case "READY_FOR_MERGE_AUTHORIZATION":
					if (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;
					if (
						before.pullRequest !== undefined &&
						before.prHealth?.headSha === before.pullRequest.headSha &&
						(before.prHealth.status === "PASS" || before.prHealth.status === "NONE")
					) {
						after = this.engine.requestMergeAuthorization(jobId);
					} else {
						after = await this.engine.runPrHealthGate(jobId, signal);
					}
					break;
				case "MERGING":
					after = await this.engine.runWriterMerge(jobId, signal);
					break;
				default:
					return;
			}
			if (signal.aborted) return;
			if (after.state === before.state && after.revision <= before.revision) {
				throw new Error(`workflow driver made no durable progress from ${before.state}`);
			}
		}
	}
}
