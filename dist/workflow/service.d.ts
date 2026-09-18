import type { WorkflowActivationResource, WorkflowAdmissionActivationRegistry } from "#internet/workflow/admission/activation-registry";
import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type { AdmissionConfirmationInput, WorkflowAdmissionDraftInput, WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
import { type WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
export interface WorkflowServiceEngine {
    start(input: StartWorkflowInput): WorkflowJob;
    continue(jobId: string): WorkflowJob;
}
export interface WorkflowServiceDriver {
    enqueue(jobId: string): void;
    cancel(jobId: string): Promise<WorkflowJob>;
    isActive(jobId: string): boolean;
}
export interface WorkflowLegacyServiceRuntime {
    readonly engine: WorkflowServiceEngine;
    readonly driver: WorkflowServiceDriver;
    readonly jobs: WorkflowJobStore;
    readonly retention: WorkflowRetentionManager;
}
export interface WorkflowRunServiceDriver {
    cancel(runId: string): Promise<WorkflowRun>;
    isActive(runId: string): boolean;
}
export interface WorkflowVNextServiceRuntime {
    readonly runs: WorkflowRunStore;
    readonly driver: WorkflowRunServiceDriver;
}
export interface WorkflowServiceDependencies {
    readonly admissionService: WorkflowAdmissionService;
    readonly activationRegistry: WorkflowAdmissionActivationRegistry;
    readonly vNext?: WorkflowVNextServiceRuntime;
    readonly legacy?: WorkflowLegacyServiceRuntime;
}
export declare class WorkflowServiceError extends Error {
    constructor(message: string);
}
export declare class WorkflowService {
    private readonly admissionService;
    private readonly activationRegistry;
    private readonly vNextRuntime?;
    private readonly legacyRuntime?;
    constructor(dependencies: WorkflowServiceDependencies);
    admit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord;
    admission(context: WorkflowAuthorizationContext, admissionId: string): WorkflowAdmissionRecord;
    admissions(context: WorkflowAuthorizationContext): readonly WorkflowAdmissionRecord[];
    confirmAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedRevision: number, input: AdmissionConfirmationInput): WorkflowAdmissionRecord;
    autoSubmit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob;
    activateAdmissionTarget(context: WorkflowAuthorizationContext, admissionId: string, expectedAcceptedSpecHash: string): WorkflowActivationResource;
    targetStatus(context: WorkflowAuthorizationContext, targetId: string): WorkflowActivationResource;
    cancelTarget(context: WorkflowAuthorizationContext, targetId: string): Promise<WorkflowActivationResource>;
    /** v3 software compatibility surface retained until the explicit migration-retirement milestone. */
    activateAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedAcceptedSpecHash: string): WorkflowJob;
    list(context: WorkflowAuthorizationContext): readonly WorkflowJob[];
    status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
    continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    delete(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowDeletionReceipt>;
    isActive(jobId: string): boolean;
    private legacy;
    private ownerJobs;
    private selectJob;
}
//# sourceMappingURL=service.d.ts.map