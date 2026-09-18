import type {
	WorkflowExternalEvent,
	WorkflowExternalEventInput,
	WorkflowExternalEventWait,
	WorkflowExternalEventWaitContract,
	WorkflowTimer,
	WorkflowTimerContract,
} from "#internet/workflow/awaitables/types";
import type { WorkflowExternalEventStore } from "#internet/workflow/external-event-store";
import type { WorkflowArtifactRef } from "#internet/workflow/kernel/types";
import type { WorkflowTimerStore } from "#internet/workflow/timer-store";

export interface WorkflowAwaitableRuntimeHooks {
	readonly onTimerChanged?: () => void;
	readonly onRunWake?: (runId: string) => void;
}

export class WorkflowDurableAwaitableRuntime {
	private readonly timers: WorkflowTimerStore;
	private readonly events: WorkflowExternalEventStore;
	private readonly hooks: WorkflowAwaitableRuntimeHooks;

	constructor(
		timers: WorkflowTimerStore,
		events: WorkflowExternalEventStore,
		hooks: WorkflowAwaitableRuntimeHooks = {},
	) {
		this.timers = timers;
		this.events = events;
		this.hooks = hooks;
	}

	ensureTimer(
		runId: string,
		causedBy: WorkflowArtifactRef,
		contract: WorkflowTimerContract,
		now?: () => number,
	): WorkflowTimer {
		const timer = this.timers.ensure(runId, causedBy, contract, now);
		this.hooks.onTimerChanged?.();
		return timer;
	}

	ensureExternalEventWait(
		runId: string,
		causedBy: WorkflowArtifactRef,
		contract: WorkflowExternalEventWaitContract,
		now?: () => number,
	): WorkflowExternalEventWait {
		const wait = this.events.ensureWait(runId, causedBy, contract, now);
		if (wait.state === "MATCHED") this.hooks.onRunWake?.(runId);
		return wait;
	}

	ingestExternalEvent(input: WorkflowExternalEventInput, now?: () => number): WorkflowExternalEvent {
		const event = this.events.ingest(input, now);
		const matched = this.events.reconcile(input.runId, now);
		if (matched.length > 0) this.hooks.onRunWake?.(input.runId);
		return event;
	}

	listTimers(runId: string): readonly WorkflowTimer[] {
		return this.timers.list(runId);
	}

	listExternalEventWaits(runId: string): readonly WorkflowExternalEventWait[] {
		return this.events.listWaits(runId);
	}

	hasOpen(runId: string, needArtifactId: string): boolean {
		return (
			this.timers
				.list(runId)
				.some((timer) => timer.causedBy.artifactId === needArtifactId && timer.state === "PENDING") ||
			this.events
				.listWaits(runId)
				.some((wait) => wait.causedBy.artifactId === needArtifactId && wait.state === "WAITING")
		);
	}

	reconcile(runId: string, now?: () => number): void {
		const fired = this.timers.reconcile(runId, now);
		const matched = this.events.reconcile(runId, now);
		if (fired.length > 0) this.hooks.onTimerChanged?.();
		if (fired.length > 0 || matched.length > 0) this.hooks.onRunWake?.(runId);
	}
}
