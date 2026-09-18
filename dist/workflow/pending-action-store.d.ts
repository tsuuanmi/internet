import { type WorkflowPendingAction, type WorkflowPendingActionContract } from "#internet/workflow/interactions/types";
import type { WorkflowArtifact, WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowNeedPayload } from "#internet/workflow/semantic/types";
export interface EnsureWorkflowPendingActionInput {
    readonly run: WorkflowRun;
    readonly needArtifact: WorkflowArtifact;
    readonly need: WorkflowNeedPayload;
    readonly contract: WorkflowPendingActionContract;
    readonly now?: () => number;
}
export declare class WorkflowPendingActionStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowPendingActionStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, actionId: string): string;
    ensure(input: EnsureWorkflowPendingActionInput): WorkflowPendingAction;
    get(runId: string, actionId: string): WorkflowPendingAction | undefined;
    hasOpen(runId: string, causedByArtifactId: string): boolean;
    list(runId: string): readonly WorkflowPendingAction[];
    update(runId: string, actionId: string, expectedRevision: number, mutate: (current: WorkflowPendingAction) => WorkflowPendingAction): WorkflowPendingAction;
}
//# sourceMappingURL=pending-action-store.d.ts.map