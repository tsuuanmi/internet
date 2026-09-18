import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { WorkflowActivationResource } from "#internet/workflow/admission/activation-registry";
import type { AdmissionConfirmationInput, WorkflowAdmissionDraftInput, WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
import { type WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import type { GitRunner } from "#internet/workflow/repository-context";
import type { WorkflowJob } from "#internet/workflow/types";
export declare const WORKFLOW_OPERATIONS: readonly ["admit", "confirm", "activate", "test", "status", "cancel", "continue"];
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];
export interface InternetWorkflowToolDependencies {
    readonly browser?: Pick<BrowserManager, "status">;
    readonly runGit?: GitRunner;
    readonly timeoutMs?: number;
    readonly pollMs?: number;
    readonly defaultProfile?: "software_change" | "deep_research";
}
export interface InternetWorkflowService {
    admit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord;
    confirmAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedRevision: number, input: AdmissionConfirmationInput): WorkflowAdmissionRecord;
    activateAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedAcceptedSpecHash: string): WorkflowJob;
    activateAdmissionTarget(context: WorkflowAuthorizationContext, admissionId: string, expectedAcceptedSpecHash: string): WorkflowActivationResource;
    targetStatus(context: WorkflowAuthorizationContext, targetId: string): WorkflowActivationResource;
    cancelTarget(context: WorkflowAuthorizationContext, targetId: string): Promise<WorkflowActivationResource>;
    status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
    continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
}
export declare function defineInternetWorkflowTool(service: InternetWorkflowService, dependencies?: InternetWorkflowToolDependencies): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-workflow.d.ts.map