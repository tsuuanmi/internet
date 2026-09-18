import { type WorkflowExternalEvent, type WorkflowExternalEventInput, type WorkflowExternalEventWait, type WorkflowExternalEventWaitContract } from "#internet/workflow/awaitables/types";
import type { WorkflowArtifactRef } from "#internet/workflow/kernel/types";
export declare class WorkflowExternalEventStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowExternalEventStore {
    private readonly eventRoot;
    private readonly waitRoot;
    constructor(dataDir: string);
    private eventRunDir;
    private waitRunDir;
    eventPathFor(runId: string, eventId: string): string;
    waitPathFor(runId: string, waitId: string): string;
    ingest(input: WorkflowExternalEventInput, now?: () => number): WorkflowExternalEvent;
    ensureWait(runId: string, causedBy: WorkflowArtifactRef, contract: WorkflowExternalEventWaitContract, now?: () => number): WorkflowExternalEventWait;
    getEvent(runId: string, eventId: string): WorkflowExternalEvent | undefined;
    getWait(runId: string, waitId: string): WorkflowExternalEventWait | undefined;
    listEvents(runId: string): readonly WorkflowExternalEvent[];
    listWaits(runId: string): readonly WorkflowExternalEventWait[];
    reconcile(runId: string, now?: () => number): readonly WorkflowExternalEventWait[];
    private reconcileWait;
    private updateWait;
}
//# sourceMappingURL=external-event-store.d.ts.map