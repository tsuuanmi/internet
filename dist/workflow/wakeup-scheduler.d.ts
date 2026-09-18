import type { WorkflowExternalEventStore } from "#internet/workflow/external-event-store";
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
export declare class WorkflowWakeupScheduler {
    private readonly timers;
    private readonly events;
    private readonly runs;
    private readonly driver;
    private readonly now;
    private readonly setTimer;
    private readonly clearTimer;
    private scheduled?;
    private disposed;
    constructor(timers: WorkflowTimerStore, events: WorkflowExternalEventStore, runs: WorkflowRunStore, driver: WorkflowWakeupDriver, options?: WorkflowWakeupSchedulerOptions);
    start(): void;
    refresh(): void;
    dispose(): void;
    private reconcileExternalEvents;
    private reconcileOverdue;
}
//# sourceMappingURL=wakeup-scheduler.d.ts.map