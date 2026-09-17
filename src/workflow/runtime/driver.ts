import { randomBytes } from "node:crypto";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowRunCoordinator } from "#internet/workflow/runtime/coordinator";

interface ActiveRun {
	readonly controller: AbortController;
	readonly promise: Promise<void>;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

export class WorkflowRunDriver {
	private readonly active = new Map<string, ActiveRun>();
	private readonly coordinator: WorkflowRunCoordinator;
	private readonly runs: WorkflowRunStore;
	private disposed = false;

	constructor(coordinator: WorkflowRunCoordinator, runs: WorkflowRunStore) {
		this.coordinator = coordinator;
		this.runs = runs;
	}

	isActive(runId: string): boolean {
		return this.active.has(runId);
	}

	enqueue(runId: string): void {
		if (this.disposed || this.active.has(runId)) return;
		const controller = new AbortController();
		const ownerInstanceId = randomBytes(16).toString("hex");
		const promise = this.drive(runId, ownerInstanceId, controller.signal)
			.catch((error: unknown) => {
				if (isAbort(error, controller.signal)) return;
				const run = this.runs.get(runId);
				if (run === undefined || ["COMPLETED", "CANCELLED"].includes(run.lifecycle)) return;
				this.runs.update(runId, run.revision, (current) => ({
					...current,
					revision: current.revision + 1,
					lifecycle: "BLOCKED",
					updatedAt: new Date().toISOString(),
				}));
			})
			.finally(() => {
				const current = this.active.get(runId);
				if (current?.promise === promise) this.active.delete(runId);
			});
		this.active.set(runId, { controller, promise });
	}

	resumeActive(): void {
		if (this.disposed) return;
		for (const run of this.runs.list()) {
			if (["CREATED", "ACTIVE"].includes(run.lifecycle)) this.enqueue(run.runId);
		}
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const active = [...this.active.values()];
		for (const run of active) run.controller.abort();
		await Promise.allSettled(active.map((run) => run.promise));
		this.active.clear();
	}

	private async drive(runId: string, ownerInstanceId: string, signal: AbortSignal): Promise<void> {
		await this.coordinator.reconcile(runId, signal);
		while (!signal.aborted) {
			const run = this.coordinator.advance(runId);
			if (["BLOCKED", "WAITING_EXTERNAL", "COMPLETED", "CANCELLED"].includes(run.lifecycle)) return;
			const runnable = this.coordinator.runnableWorkItemIds(runId);
			if (runnable.length === 0) {
				await this.coordinator.reconcile(runId, signal);
				const after = this.coordinator.advance(runId);
				if (["BLOCKED", "WAITING_EXTERNAL", "COMPLETED", "CANCELLED"].includes(after.lifecycle)) return;
				if (this.coordinator.runnableWorkItemIds(runId).length === 0)
					throw new Error(`workflow run ${runId} is active without runnable or recoverable work`);
				continue;
			}
			await Promise.all(
				runnable.map((workItemId) => this.coordinator.execute(runId, workItemId, ownerInstanceId, signal)),
			);
		}
	}
}
