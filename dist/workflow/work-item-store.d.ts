import type { WorkflowWorkItem } from "#internet/workflow/kernel/types";
export declare class WorkflowWorkItemStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowWorkItemStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, workItemId: string): string;
    create(item: WorkflowWorkItem): WorkflowWorkItem;
    get(runId: string, workItemId: string): WorkflowWorkItem | undefined;
    list(runId: string): readonly WorkflowWorkItem[];
    update(runId: string, workItemId: string, expectedRevision: number, mutate: (current: WorkflowWorkItem) => WorkflowWorkItem): WorkflowWorkItem;
}
//# sourceMappingURL=work-item-store.d.ts.map