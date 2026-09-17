import { type WorkflowArtifactRef, type WorkflowInputBundle, type WorkflowInputFact, type WorkflowVersionRef } from "#internet/workflow/kernel/types";
export interface CreateWorkflowInputBundleInput {
    readonly runId: string;
    readonly workItemId: string;
    readonly capability: WorkflowVersionRef;
    readonly projection: WorkflowVersionRef;
    readonly artifacts?: readonly WorkflowArtifactRef[];
    readonly facts?: readonly WorkflowInputFact[];
}
export declare class WorkflowInputBundleStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowInputBundleStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, bundleId: string): string;
    create(input: CreateWorkflowInputBundleInput): WorkflowInputBundle;
    get(runId: string, bundleId: string): WorkflowInputBundle | undefined;
    list(runId: string): readonly WorkflowInputBundle[];
}
//# sourceMappingURL=input-bundle-store.d.ts.map