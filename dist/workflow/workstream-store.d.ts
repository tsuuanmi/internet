import type { WorkflowWorkstream } from "#internet/workflow/workstream";
export declare class WorkflowWorkstreamStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowWorkstreamStore {
    private readonly directory;
    constructor(dataDir: string);
    pathFor(workstreamId: string): string;
    create(workstream: WorkflowWorkstream): WorkflowWorkstream;
    get(workstreamId: string): WorkflowWorkstream | undefined;
    list(): readonly WorkflowWorkstream[];
    update(workstreamId: string, expectedRevision: number, mutate: (current: WorkflowWorkstream) => WorkflowWorkstream): WorkflowWorkstream;
}
//# sourceMappingURL=workstream-store.d.ts.map