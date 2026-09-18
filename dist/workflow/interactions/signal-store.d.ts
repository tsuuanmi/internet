import type { WorkflowPrincipal } from "#internet/workflow/authorization";
import { type WorkflowExternalSignal, type WorkflowExternalSignalInput } from "#internet/workflow/interactions/types";
export declare class WorkflowExternalSignalStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowExternalSignalStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, signalId: string): string;
    create(input: WorkflowExternalSignalInput, principal: WorkflowPrincipal, now?: () => number): WorkflowExternalSignal;
    get(runId: string, signalId: string): WorkflowExternalSignal | undefined;
    list(runId: string): readonly WorkflowExternalSignal[];
}
//# sourceMappingURL=signal-store.d.ts.map