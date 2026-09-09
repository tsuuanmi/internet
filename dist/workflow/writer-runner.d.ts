import { type WorkflowApprovalScope } from "#internet/workflow/approval-policy";
import type { WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";
export interface WorkflowWriterRunner {
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<void>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
export interface WorkflowWriterBrowser {
    chat(accountId: "chatgpt-writer", request: {
        readonly prompt: string;
        readonly sessionId: string;
        readonly confirmation?: WorkflowApprovalScope;
        readonly signal?: AbortSignal;
    }): Promise<{
        readonly text: string;
    }>;
}
export interface WorkflowWriterDeliveryRequest {
    readonly sessionId: string;
    /** Exact data-plane payload. This value must be submitted without wrapping or normalization. */
    readonly payload: string;
    readonly signal?: AbortSignal;
}
export interface WorkflowWriterControlRequest {
    readonly sessionId: string;
    readonly job: WorkflowJob;
    readonly control: WorkflowControlMessage;
    readonly signal?: AbortSignal;
}
export type WorkflowWriterResult = {
    readonly status: "PR_OPEN";
    readonly pullRequest: WorkflowPullRequestReceipt;
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
/** Persistent ChatGPT Website writer bound to the workflow's dedicated writer conversation. */
export declare class BrowserWorkflowWriterRunner implements WorkflowWriterRunner {
    private readonly browser;
    constructor(browser: WorkflowWriterBrowser);
    deliverExact(request: WorkflowWriterDeliveryRequest): Promise<void>;
    runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult>;
}
//# sourceMappingURL=writer-runner.d.ts.map