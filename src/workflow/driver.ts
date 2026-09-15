import { randomBytes } from "node:crypto";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob } from "#internet/workflow/types";
import { workflowJobIsTerminal } from "#internet/workflow/types";

export interface WorkflowDriverEngine {
	status(jobId: string): WorkflowJob;
	reconcile(jobId: string, ownerInstanceId: string, at?: number): WorkflowJob;
	advance(jobId: string): WorkflowJob;
	runnableNodeIds(jobId: string, at?: number): readonly string[];
	nextRecoveryAt(jobId: string): string | undefined;
	executeNode(jobId: string, nodeId: string, ownerInstanceId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	cancel(jobId: string): WorkflowJob;
}

interface ActiveRun {
	readonly controller: AbortController;
	readonly promise: Promise<void>;
	readonly ownerInstanceId: string;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function shouldResume(job: WorkflowJob): boolean {
	return !workflowJobIsTerminal(job) && (job.graph.lifecycle === "RUNNING" || job.graph.lifecycle === "RECOVERING");
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

/** Background owner for one durable graph scheduler. Semantic readiness remains in WorkflowEngine. */
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
		const ownerInstanceId = randomBytes(16).toString("hex");
		const promise = this.drive(jobId, ownerInstanceId, controller.signal)
			.catch((error: unknown) => {
				if (isAbort(error, controller.signal)) return;
				this.blockRuntimeFailure(jobId, error);
			})
			.finally(() => {
				const current = this.active.get(jobId);
				if (current?.promise === promise) this.active.delete(jobId);
			});
		this.active.set(jobId, { controller, promise, ownerInstanceId });
	}

	resumeActive(): void {
		if (this.disposed) return;
		for (const job of this.jobs.list()) if (shouldResume(job)) this.enqueue(job.jobId);
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

	private blockRuntimeFailure(jobId: string, error: unknown): void {
		try {
			const current = this.engine.status(jobId);
			if (workflowJobIsTerminal(current)) return;
			const at = new Date().toISOString();
			const message = `workflow scheduler failed: ${error instanceof Error ? error.message : String(error)}`;
			this.jobs.update(jobId, current.revision, (job) => ({
				...job,
				revision: job.revision + 1,
				updatedAt: at,
				graph: {
					...job.graph,
					graphRevision: job.graph.graphRevision + 1,
					eventSeq: job.graph.eventSeq + 1,
					lifecycle: "BLOCKED",
				},
				pendingAction: { kind: "CODE_FIX_REQUIRED", message },
				lastEvent: { type: "SCHEDULER_FAILED", class: "ACTION_REQUIRED", at, message },
			}));
		} catch {
			// If durable storage itself is unavailable, the driver cannot safely invent recovery state.
		}
	}

	private async drive(jobId: string, ownerInstanceId: string, signal: AbortSignal): Promise<void> {
		this.engine.reconcile(jobId, ownerInstanceId);
		while (!signal.aborted) {
			let job = this.engine.advance(jobId);
			if (
				workflowJobIsTerminal(job) ||
				job.graph.lifecycle === "BLOCKED" ||
				job.graph.lifecycle === "WAITING_USER"
			) {
				return;
			}

			const runnable = this.engine.runnableNodeIds(jobId);
			if (runnable.length > 0) {
				await Promise.all(
					runnable.map((nodeId) => this.engine.executeNode(jobId, nodeId, ownerInstanceId, signal)),
				);
				continue;
			}

			job = this.engine.reconcile(jobId, ownerInstanceId);
			if (
				workflowJobIsTerminal(job) ||
				job.graph.lifecycle === "BLOCKED" ||
				job.graph.lifecycle === "WAITING_USER"
			) {
				return;
			}
			if (this.engine.runnableNodeIds(jobId).length > 0) continue;

			const notBefore = this.engine.nextRecoveryAt(jobId);
			if (notBefore !== undefined) {
				await delay(Math.max(1, Date.parse(notBefore) - Date.now()), signal);
				continue;
			}
			throw new Error(`no READY or scheduled recovery node exists while workflow is ${job.graph.lifecycle}`);
		}
	}
}
