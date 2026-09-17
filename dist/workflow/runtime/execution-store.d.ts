import { type WorkflowExecution } from "#internet/workflow/runtime/types";
export declare class WorkflowExecutionStoreError extends Error {
    constructor(message: string);
}
export declare function parseWorkflowExecution(value: unknown): WorkflowExecution;
export declare class WorkflowExecutionStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, executionId: string): string;
    create(execution: WorkflowExecution): WorkflowExecution;
    get(runId: string, executionId: string): WorkflowExecution | undefined;
    list(runId: string): readonly WorkflowExecution[];
    update(runId: string, executionId: string, expectedRevision: number, mutate: (current: WorkflowExecution) => WorkflowExecution): WorkflowExecution;
}
//# sourceMappingURL=execution-store.d.ts.map