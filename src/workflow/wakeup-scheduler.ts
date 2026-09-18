import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowTimerStore } from "#internet/workflow/timer-store";

export interface WorkflowWakeupDriver {
	enqueue(runId: string): void;
}

export interface WorkflowWakeupSchedulerOptions {
	readonly now?: () => number;
	readonly setTimer?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
	readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const MAX_TIMEOUT_MS = 2_147_000_000;

export class WorkflowWakeupScheduler {
	private readonly timers: WorkflowTimerStore;
	private readonly runs: WorkflowRunStore;
	private readonly driver: WorkflowWakeupDriver;
	private readonly now: () => number;
	private readonly setTimer: NonNullable<WorkflowWakeupSchedulerOptions["setTimer"]>;
	private readonly clearTimer: NonNullable<WorkflowWakeupSchedulerOptions["clearTimer"]>;
	private scheduled?: ReturnType<typeof setTimeout>;
	private disposed = false;

	constructor(
		timers: WorkflowTimerStore,
		runs: WorkflowRunStore,
		driver: WorkflowWakeupDriver,
		options: WorkflowWakeupSchedulerOptions = {},
	) {
		this.timers = timers;
		this.runs = runs;
		this.driver = driver;
		this.now = options.now ?? Date.now;
		this.setTimer = options.setTimer ?? ((handler, delayMs) => setTimeout(handler, delayMs));
		this.clearTimer = options.clearTimer ?? clearTimeout;
	}

	start(): void {
		if (this.disposed) return;
		this.reconcileOverdue();
		this.refresh();
	}

	refresh(): void {
		if (this.disposed) return;
		if (this.scheduled !== undefined) {
			this.clearTimer(this.scheduled);
			this.scheduled = undefined;
		}
		const pending = this.timers
			.listAll()
			.filter((timer) => timer.state === "PENDING")
			.filter((timer) => {
				const run = this.runs.get(timer.runId);
				return run !== undefined && !["COMPLETED", "CANCELLED"].includes(run.lifecycle);
			})
			.sort((left, right) => left.deadline.localeCompare(right.deadline) || left.timerId.localeCompare(right.timerId));
		const next = pending[0];
		if (next === undefined) return;
		const delayMs = Math.max(1, Math.min(MAX_TIMEOUT_MS, Date.parse(next.deadline) - this.now()));
		this.scheduled = this.setTimer(() => {
			this.scheduled = undefined;
			this.reconcileOverdue();
			this.refresh();
		}, delayMs);
	}

	dispose(): void {
		this.disposed = true;
		if (this.scheduled !== undefined) {
			this.clearTimer(this.scheduled);
			this.scheduled = undefined;
		}
	}

	private reconcileOverdue(): void {
		const now = this.now;
		const runIds = new Set(
			this.timers
				.listAll()
				.filter((timer) => timer.state === "PENDING" && Date.parse(timer.deadline) <= now())
				.map((timer) => timer.runId),
		);
		for (const runId of runIds) {
			const fired = this.timers.reconcile(runId, now);
			if (fired.length > 0) this.driver.enqueue(runId);
		}
	}
}
