import type { WorkflowRun } from "#internet/workflow/kernel/types";
export declare class WorkflowRunStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowRunStore {
    private readonly runsDir;
    constructor(dataDir: string);
    pathFor(runId: string): string;
    create(run: WorkflowRun): WorkflowRun;
    get(runId: string): WorkflowRun | undefined;
    list(): readonly WorkflowRun[];
    update(runId: string, expectedRevision: number, mutate: (current: WorkflowRun) => WorkflowRun): WorkflowRun;
}
//# sourceMappingURL=run-store.d.ts.map