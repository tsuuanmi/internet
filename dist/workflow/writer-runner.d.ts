import type { ProviderProgressEvent } from "#internet/browser/completion";
import { type WorkflowApprovalScope } from "#internet/workflow/approval-policy";
import type { WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";
export interface WorkflowWriterRunner {
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<{
        readonly conversationUrl: string;
    }>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
export interface WorkflowWriterBrowser {
    chat(accountId: "chatgpt-writer", request: {
        readonly prompt: string;
        readonly sessionId: string;
        readonly timeoutMs: number;
        readonly stallTimeoutMs: number;
        readonly responseRepresentation: "text";
        readonly onProgress?: (event: ProviderProgressEvent) => void;
        readonly confirmation?: WorkflowApprovalScope;
        readonly signal?: AbortSignal;
    }): Promise<{
        readonly text: string;
        readonly url: string;
    }>;
}
interface WorkflowWriterProviderPolicy {
    readonly hardTimeoutMs: number;
    readonly stallTimeoutMs: number;
}
interface WorkflowWriterRequestBase {
    readonly sessionId: string;
    readonly requestKey: string;
    readonly signal?: AbortSignal;
    readonly onProviderProgress?: (event: ProviderProgressEvent) => void;
}
export interface WorkflowWriterDeliveryRequest extends WorkflowWriterRequestBase {
    readonly payload: string;
}
export interface WorkflowWriterControlRequest extends WorkflowWriterRequestBase {
    readonly job: WorkflowJob;
    readonly control: WorkflowControlMessage;
}
export type WorkflowWriterResult = {
    readonly status: "PR_OPEN";
    readonly pullRequest: WorkflowPullRequestReceipt;
    readonly conversationUrl: string;
} | {
    readonly status: "BLOCKED";
    readonly message: string;
    readonly conversationUrl?: string;
} | {
    readonly status: "UNKNOWN_CONFIRMATION";
    readonly message: string;
    readonly conversationUrl?: string;
};
type WorkflowWriterPayload = {
    readonly status: "PR_OPEN";
    readonly pullRequest: WorkflowPullRequestReceipt;
} | {
    readonly status: "BLOCKED";
    readonly message: string;
};
export declare function parseWorkflowWriterResult(text: string): WorkflowWriterPayload;
export declare class BrowserWorkflowWriterRunner implements WorkflowWriterRunner {
    private readonly browser;
    private readonly policy;
    constructor(browser: WorkflowWriterBrowser, policy: WorkflowWriterProviderPolicy);
    private providerRequest;
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<{
        readonly conversationUrl: string;
    }>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
export {};
//# sourceMappingURL=writer-runner.d.ts.map