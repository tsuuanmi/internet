import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
export declare class WorkflowExecutionResultStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowExecutionResultStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, executionId: string): string;
    create(runId: string, resultValue: unknown): WorkflowSemanticExecutionResult;
    get(runId: string, executionId: string): WorkflowSemanticExecutionResult | undefined;
    list(runId: string): readonly WorkflowSemanticExecutionResult[];
}
//# sourceMappingURL=result-store.d.ts.map