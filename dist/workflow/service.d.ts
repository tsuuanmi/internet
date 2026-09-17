import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type { AdmissionConfirmationInput, WorkflowAdmissionDraftInput, WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
import { type WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
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
export declare class WorkflowServiceError extends Error {
    constructor(message: string);
}
export declare class WorkflowService {
    private readonly engine;
    private readonly driver;
    private readonly jobs;
    private readonly retention;
    private readonly admissionService;
    constructor(engine: WorkflowServiceEngine, driver: WorkflowServiceDriver, jobs: WorkflowJobStore, retention: WorkflowRetentionManager, admissionService: WorkflowAdmissionService);
    admit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord;
    admission(context: WorkflowAuthorizationContext, admissionId: string): WorkflowAdmissionRecord;
    admissions(context: WorkflowAuthorizationContext): readonly WorkflowAdmissionRecord[];
    confirmAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedRevision: number, input: AdmissionConfirmationInput): WorkflowAdmissionRecord;
    start(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob;
    activateAdmission(context: WorkflowAuthorizationContext, admissionId: string, expectedAcceptedSpecHash: string): WorkflowJob;
    list(context: WorkflowAuthorizationContext): readonly WorkflowJob[];
    status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
    continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
    delete(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowDeletionReceipt>;
    isActive(jobId: string): boolean;
    private ownerJobs;
    private selectJob;
}
//# sourceMappingURL=service.d.ts.map