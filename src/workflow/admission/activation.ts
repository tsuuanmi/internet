import type { AcceptedAdmissionSpec, AdmissionActivationTarget } from "#internet/workflow/admission/types";

export interface WorkflowAdmissionActivator {
	target(spec: AcceptedAdmissionSpec): AdmissionActivationTarget;
	ensure(spec: AcceptedAdmissionSpec, target: AdmissionActivationTarget): void;
}

export function sameAdmissionActivationTarget(
	left: AdmissionActivationTarget,
	right: AdmissionActivationTarget,
): boolean {
	return left.targetKind === right.targetKind && left.targetId === right.targetId;
}
