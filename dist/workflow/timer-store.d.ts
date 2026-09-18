import { type WorkflowTimer, type WorkflowTimerContract } from "#internet/workflow/awaitables/types";
import type { WorkflowArtifactRef } from "#internet/workflow/kernel/types";
export declare class WorkflowTimerStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowTimerStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, timerId: string): string;
    ensure(runId: string, causedBy: WorkflowArtifactRef, contract: WorkflowTimerContract, now?: () => number): WorkflowTimer;
    get(runId: string, timerId: string): WorkflowTimer | undefined;
    list(runId: string): readonly WorkflowTimer[];
    listAll(): readonly WorkflowTimer[];
    update(runId: string, timerId: string, expectedRevision: number, mutate: (current: WorkflowTimer) => WorkflowTimer): WorkflowTimer;
    cancelPendingExcept(runId: string, activeNeedArtifactIds: ReadonlySet<string>, now?: () => number): readonly WorkflowTimer[];
    reconcile(runId: string, now?: () => number): readonly WorkflowTimer[];
}
//# sourceMappingURL=timer-store.d.ts.map