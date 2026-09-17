import type {
	AdmissionConfirmationReason,
	AdmissionDefault,
	WorkflowAdmissionConfirmationLevel,
	WorkflowAdmissionDraft,
} from "#internet/workflow/admission/types";

export interface WorkflowProfileAdmissionResult {
	readonly confirmationLevel: WorkflowAdmissionConfirmationLevel;
	readonly confirmationReasons: readonly AdmissionConfirmationReason[];
	readonly defaults: readonly AdmissionDefault[];
	readonly unresolved: readonly string[];
	readonly warnings: readonly string[];
	readonly errors: readonly string[];
}

export interface WorkflowProfileDescriptor {
	readonly id: string;
	readonly version: string;
	preflightAdmission(draft: WorkflowAdmissionDraft): WorkflowProfileAdmissionResult;
}
