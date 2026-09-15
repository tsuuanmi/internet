import type { ProviderProgressEvent } from "#internet/browser/completion";
import { type WorkflowApprovalScope } from "#internet/workflow/approval-policy";
import type { WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowCiStatus, WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";
export interface WorkflowWriterRunner {
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<void>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
export interface WorkflowWriterBrowser {
    chat(accountId: "chatgpt-writer", request: {
        readonly prompt: string;
        readonly sessionId: string;
        readonly timeoutMs: number;
        readonly stallTimeoutMs: number;
        readonly onProgress?: (event: ProviderProgressEvent) => void;
        readonly confirmation?: WorkflowApprovalScope;
        readonly signal?: AbortSignal;
    }): Promise<{
        readonly text: string;
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
} | {
    readonly status: "PR_HEALTH";
    readonly repository: string;
    readonly number: number;
    readonly url: string;
    readonly headSha: string;
    readonly health: WorkflowCiStatus;
} | {
    readonly status: "MERGED";
    readonly repository: string;
    readonly number: number;
    readonly url: string;
    readonly headSha: string;
    readonly mergedSha: string;
} | {
    readonly status: "BLOCKED";
    readonly message: string;
} | {
    readonly status: "UNKNOWN_CONFIRMATION";
    readonly message: string;
};
export declare function parseWorkflowWriterResult(text: string): WorkflowWriterResult;
export declare class BrowserWorkflowWriterRunner implements WorkflowWriterRunner {
    private readonly browser;
    private readonly policy;
    constructor(browser: WorkflowWriterBrowser, policy: WorkflowWriterProviderPolicy);
    private providerRequest;
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<void>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
export {};
//# sourceMappingURL=writer-runner.d.ts.map