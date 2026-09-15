import { type AccountId } from "#internet/core/accounts";
export declare const PROVIDER_TURN_RECEIPT_SCHEMA: "@tsuuanmi/internet-provider-turn-receipt";
export type ProviderTurnReceiptStatus = "SUBMITTED" | "COMPLETED";
export interface ProviderTurnReceipt {
    readonly schema: typeof PROVIDER_TURN_RECEIPT_SCHEMA;
    readonly version: 1;
    readonly receiptId: string;
    readonly workflowJobId: string;
    readonly accountId: AccountId;
    readonly sessionHash: string;
    readonly requestKeyHash: string;
    readonly promptHash: string;
    readonly previousResponseHash: string;
    readonly status: ProviderTurnReceiptStatus;
    readonly revision: number;
    readonly submittedAt: string;
    readonly conversationUrl?: string;
    readonly responseHash?: string;
    readonly completedAt?: string;
}
export interface ProviderTurnSnapshot {
    readonly text: string;
    readonly running: boolean;
}
export type ProviderTurnReconciliation = "WAIT" | "RECOVER" | "RESUBMIT" | "AMBIGUOUS";
export declare class ProviderTurnReceiptError extends Error {
    constructor(message: string);
}
export declare function hashProviderTurnText(value: string): string;
export declare function workflowJobIdFromRequestKey(requestKey: string): string;
export declare function providerTurnReceiptId(workflowJobId: string, accountId: AccountId, sessionId: string, requestKey: string): string;
export declare function reconcileProviderTurn(receipt: ProviderTurnReceipt, snapshot: ProviderTurnSnapshot): ProviderTurnReconciliation;
export declare function parseProviderTurnReceipt(value: unknown): ProviderTurnReceipt;
export declare class ProviderTurnReceiptStore {
    private readonly root;
    private readonly workflowJobId;
    private readonly accountId;
    constructor(dataDir: string, workflowJobId: string, accountId: AccountId);
    read(sessionId: string, requestKey: string): ProviderTurnReceipt | undefined;
    submit(input: {
        readonly sessionId: string;
        readonly requestKey: string;
        readonly prompt: string;
        readonly previousResponse: string;
        readonly conversationUrl?: string;
    }): ProviderTurnReceipt;
    bindConversation(sessionId: string, requestKey: string, conversationUrl: string): ProviderTurnReceipt;
    complete(sessionId: string, requestKey: string, response: string, conversationUrl: string): ProviderTurnReceipt;
    private require;
    private write;
}
//# sourceMappingURL=turn-receipts.d.ts.map