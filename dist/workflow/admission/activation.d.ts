import type { AcceptedAdmissionSpec, AdmissionActivationTarget } from "#internet/workflow/admission/types";
export interface WorkflowAdmissionActivator {
    target(spec: AcceptedAdmissionSpec): AdmissionActivationTarget;
    ensure(spec: AcceptedAdmissionSpec, target: AdmissionActivationTarget): void;
}
export declare function sameAdmissionActivationTarget(left: AdmissionActivationTarget, right: AdmissionActivationTarget): boolean;
//# sourceMappingURL=activation.d.ts.map