export declare const WORKFLOW_NODE_RESULT_SCHEMA: "@tsuuanmi/internet-workflow-node-result";
export interface WorkflowNodeResult {
    readonly schema: typeof WORKFLOW_NODE_RESULT_SCHEMA;
    readonly version: 1;
    readonly resultId: string;
    readonly jobId: string;
    readonly nodeId: string;
    readonly inputHash: string;
    readonly payload: string;
    readonly outputHash: string;
    readonly completedAt: string;
}
export interface CreateWorkflowNodeResultInput {
    readonly jobId: string;
    readonly nodeId: string;
    readonly inputHash: string;
    readonly payload: string;
}
export declare class WorkflowNodeResultStoreError extends Error {
    constructor(message: string);
}
export declare function hashWorkflowNodePayload(payload: string): string;
export declare function workflowNodeResultId(input: Omit<CreateWorkflowNodeResultInput, "payload">): string;
export declare function parseWorkflowNodeResult(value: unknown): WorkflowNodeResult;
export declare class WorkflowNodeResultStore {
    private readonly root;
    constructor(dataDir: string);
    private jobDir;
    pathFor(jobId: string, resultId: string): string;
    getForInput(jobId: string, nodeId: string, inputHash: string): WorkflowNodeResult | undefined;
    create(input: CreateWorkflowNodeResultInput): WorkflowNodeResult;
    get(jobId: string, resultId: string): WorkflowNodeResult | undefined;
}
//# sourceMappingURL=node-result-store.d.ts.map