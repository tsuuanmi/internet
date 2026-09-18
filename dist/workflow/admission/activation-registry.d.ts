import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { AdmissionActivationTarget } from "#internet/workflow/admission/types";
import type { WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowJob } from "#internet/workflow/types";
export type WorkflowActivationResource = {
    readonly kind: "workflow_job";
    readonly job: WorkflowJob;
} | {
    readonly kind: "workflow_run";
    readonly run: WorkflowRun;
};
export interface WorkflowAdmissionActivationHandler {
    readonly profileId: string;
    activator(context: WorkflowAuthorizationContext): WorkflowAdmissionActivator;
    resolve(target: AdmissionActivationTarget): WorkflowActivationResource;
}
export declare class WorkflowAdmissionActivationRegistryError extends Error {
    constructor(message: string);
}
export declare class WorkflowAdmissionActivationRegistry {
    private readonly handlers;
    constructor(handlers: readonly WorkflowAdmissionActivationHandler[]);
    resolve(profileId: string): WorkflowAdmissionActivationHandler;
}
//# sourceMappingURL=activation-registry.d.ts.map