import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type { WorkflowAdmissionProvenance } from "#internet/workflow/admission/types";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
export type WorkflowPrincipalKind = "session" | "user" | "service";
export interface WorkflowPrincipal {
    readonly kind: WorkflowPrincipalKind;
    readonly id: string;
}
export interface WorkflowAuthorizationContext {
    readonly principal: WorkflowPrincipal;
    readonly legacyOwnerSessionId?: string;
}
export interface WorkflowServiceEngine {
    start(input: StartWorkflowInput): WorkflowJob;
    continue(jobId: string): WorkflowJob;
}
export interface WorkflowServiceDriver {
    enqueue(jobId: string): void;
    cancel(jobId: string): Promise<WorkflowJob>;
    isActive(jobId: string): boolean;
}
export interface WorkflowStartAdmissionContext {
    readonly rawSource: string;
    readonly sourceProvenance: "user_explicit" | "local_interpreted";
    readonly targetProvenance: Extract<WorkflowAdmissionProvenance, "system_observed" | "local_interpreted">;
    readonly authorityProvenance: Extract<WorkflowAdmissionProvenance, "user_explicit" | "local_interpreted">;
}
export type StartAuthorizedWorkflowInput = Omit<StartWorkflowInput, "ownerSessionId" | "jobId"> & {
    readonly admission?: WorkflowStartAdmissionContext;
};
export declare class WorkflowServiceError extends Error {
    constructor(message: string);
}
export declare function workflowSessionAuthorizationContext(sessionId: string): WorkflowAuthorizationContext;
export declare class WorkflowService {
    private readonly engine;
    private readonly driver;
    private readonly jobs;
    private readonly retention;
    private readonly admissions?;
    constructor(engine: WorkflowServiceEngine, driver: WorkflowServiceDriver, jobs: WorkflowJobStore, retention: WorkflowRetentionManager, admissions?: WorkflowAdmissionService);
    start(context: WorkflowAuthorizationContext, input: StartAuthorizedWorkflowInput): WorkflowJob;
    activateLegacyAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedRevision: number, expectedAcceptedSpecHash: string): WorkflowJob;
    list(context: WorkflowAuthorizationContext): readonly WorkflowJob[];
    status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
    continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    delete(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowDeletionReceipt>;
    isActive(jobId: string): boolean;
    private startLegacy;
    private ownerJobs;
    private selectJob;
}
//# sourceMappingURL=service.d.ts.map