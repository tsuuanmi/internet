import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { WorkflowAdmissionActivationHandler } from "#internet/workflow/admission/activation-registry";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
export interface SoftwareWorkflowActivationEngine {
    start(input: StartWorkflowInput): WorkflowJob;
}
export interface SoftwareWorkflowActivationDriver {
    enqueue(jobId: string): void;
    isActive(jobId: string): boolean;
}
export declare function createSoftwareWorkflowActivator(engine: SoftwareWorkflowActivationEngine, driver: SoftwareWorkflowActivationDriver, jobs: WorkflowJobStore, ownerSessionId: string): WorkflowAdmissionActivator;
export declare function createSoftwareWorkflowActivationHandler(engine: SoftwareWorkflowActivationEngine, driver: SoftwareWorkflowActivationDriver, jobs: WorkflowJobStore): WorkflowAdmissionActivationHandler;
//# sourceMappingURL=software-activation.d.ts.map