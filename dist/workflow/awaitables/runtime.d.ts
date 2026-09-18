import type { WorkflowExternalEvent, WorkflowExternalEventInput, WorkflowExternalEventWait, WorkflowExternalEventWaitContract, WorkflowTimer, WorkflowTimerContract } from "#internet/workflow/awaitables/types";
import type { WorkflowExternalEventStore } from "#internet/workflow/external-event-store";
import type { WorkflowArtifactRef } from "#internet/workflow/kernel/types";
import type { WorkflowTimerStore } from "#internet/workflow/timer-store";
export interface WorkflowAwaitableRuntimeHooks {
    readonly onTimerChanged?: () => void;
    readonly onRunWake?: (runId: string) => void;
}
export declare class WorkflowDurableAwaitableRuntime {
    private readonly timers;
    private readonly events;
    private readonly hooks;
    constructor(timers: WorkflowTimerStore, events: WorkflowExternalEventStore, hooks?: WorkflowAwaitableRuntimeHooks);
    ensureTimer(runId: string, causedBy: WorkflowArtifactRef, contract: WorkflowTimerContract, now?: () => number): WorkflowTimer;
    ensureExternalEventWait(runId: string, causedBy: WorkflowArtifactRef, contract: WorkflowExternalEventWaitContract, now?: () => number): WorkflowExternalEventWait;
    ingestExternalEvent(input: WorkflowExternalEventInput, now?: () => number): WorkflowExternalEvent;
    listTimers(runId: string): readonly WorkflowTimer[];
    listExternalEventWaits(runId: string): readonly WorkflowExternalEventWait[];
    cancelInactive(runId: string, activeNeedArtifactIds: ReadonlySet<string>, now?: () => number): void;
    hasOpen(runId: string, needArtifactId: string): boolean;
    reconcile(runId: string, now?: () => number): void;
}
//# sourceMappingURL=runtime.d.ts.map