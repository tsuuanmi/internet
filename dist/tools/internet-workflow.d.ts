import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { GitRunner } from "#internet/workflow/repository-context";
import { type StartAuthorizedWorkflowInput, type WorkflowAuthorizationContext } from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";
export declare const WORKFLOW_OPERATIONS: readonly ["start", "test", "status", "cancel", "continue"];
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];
export interface WorkflowTestDependencies {
    readonly browser?: Pick<BrowserManager, "status">;
    readonly runGit?: GitRunner;
    readonly timeoutMs?: number;
    readonly pollMs?: number;
}
export interface InternetWorkflowService {
    start(context: WorkflowAuthorizationContext, input: StartAuthorizedWorkflowInput): WorkflowJob;
    status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
    continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
}
export declare function defineInternetWorkflowTool(service: InternetWorkflowService, testDependencies?: WorkflowTestDependencies): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-workflow.d.ts.map