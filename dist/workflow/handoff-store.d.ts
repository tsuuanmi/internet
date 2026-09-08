import type { AccountId } from "#internet/core/accounts";
export declare const HANDOFF_SCHEMA: "@tsuuanmi/internet-workflow-handoff";
export type WorkflowHandoffStatus = "pending" | "delivered";
export interface WorkflowHandoff {
    readonly schema: typeof HANDOFF_SCHEMA;
    readonly version: 1;
    readonly handoffId: string;
    readonly jobId: string;
    readonly source: string;
    readonly recipient: AccountId;
    readonly sequence: number;
    /** Exact data-plane message. Never summarize or normalize this value. */
    readonly payload: string;
    readonly payloadHash: string;
    readonly status: WorkflowHandoffStatus;
    readonly createdAt: string;
    readonly deliveredAt?: string;
}
export interface CreateWorkflowHandoffInput {
    readonly jobId: string;
    readonly source: string;
    readonly recipient: AccountId;
    readonly sequence: number;
    readonly payload: string;
}
export declare class WorkflowHandoffStoreError extends Error {
    constructor(message: string);
}
export declare function hashHandoffPayload(payload: string): string;
export declare function parseWorkflowHandoff(value: unknown): WorkflowHandoff;
/** Private durable store for exact model-to-model data-plane messages. */
export declare class WorkflowHandoffStore {
    private readonly root;
    constructor(dataDir: string);
    private jobDir;
    pathFor(jobId: string, handoffId: string): string;
    create(input: CreateWorkflowHandoffInput): WorkflowHandoff;
    get(jobId: string, handoffId: string): WorkflowHandoff | undefined;
    markDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowHandoff;
}
//# sourceMappingURL=handoff-store.d.ts.map