import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { WorkflowAdmissionActivationHandler } from "#internet/workflow/admission/activation-registry";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
export interface ResearchWorkflowActivationDriver {
    enqueue(runId: string): void;
    isActive(runId: string): boolean;
}
export declare function createResearchWorkflowActivator(runs: WorkflowRunStore, artifacts: WorkflowArtifactStore, driver: ResearchWorkflowActivationDriver, owner: WorkflowPrincipal): WorkflowAdmissionActivator;
export declare function createResearchWorkflowActivationHandler(runs: WorkflowRunStore, artifacts: WorkflowArtifactStore, driver: ResearchWorkflowActivationDriver): WorkflowAdmissionActivationHandler;
//# sourceMappingURL=activation.d.ts.map