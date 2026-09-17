import type { AdmissionPreview, WorkflowAdmissionDraft } from "#internet/workflow/admission/types";
import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";

export class WorkflowAdmissionPreflightError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowAdmissionPreflightError";
	}
}

export function preflightWorkflowAdmission(
	admissionId: string,
	draft: WorkflowAdmissionDraft,
	draftHash: string,
	profiles: WorkflowProfileRegistry,
): AdmissionPreview {
	parseWorkflowAdmissionDraft(draft);
	const profile = profiles.resolve(draft.profileHint?.value);
	const result = profile.preflightAdmission(draft);
	if (result.unresolved.length > 0) {
		throw new WorkflowAdmissionPreflightError(
			`workflow admission has unresolved required fields: ${result.unresolved.join(", ")}`,
		);
	}
	const confirmationRequired = result.confirmationLevel !== "AUTO_SUBMIT";
	return {
		schema: "@tsuuanmi/internet-workflow-admission-preview",
		version: 1,
		admissionId,
		draftHash,
		status: confirmationRequired ? "CONFIRMATION_REQUIRED" : "READY",
		profile: { id: profile.id, version: profile.version },
		defaults: result.defaults,
		unresolved: result.unresolved,
		warnings: result.warnings,
		confirmation: {
			level: result.confirmationLevel,
			reasons: result.confirmationReasons,
		},
	};
}
