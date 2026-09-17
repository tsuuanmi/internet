import type { AdmissionPreview, WorkflowAdmissionDraft } from "#internet/workflow/admission/types";
import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";

export function preflightWorkflowAdmission(
	admissionId: string,
	draft: WorkflowAdmissionDraft,
	draftHash: string,
	profiles: WorkflowProfileRegistry,
): AdmissionPreview {
	parseWorkflowAdmissionDraft(draft);
	const profile = profiles.resolve(draft.profileHint?.value);
	const result = profile.preflightAdmission(draft);
	const status =
		result.errors.length > 0
			? "REJECTED"
			: result.unresolved.length > 0
				? "INCOMPLETE"
				: result.confirmationLevel === "AUTO_SUBMIT"
					? "READY"
					: "CONFIRMATION_REQUIRED";
	return {
		schema: "@tsuuanmi/internet-workflow-admission-preview",
		version: 1,
		admissionId,
		draftHash,
		status,
		profile: { id: profile.id, version: profile.version },
		defaults: result.defaults,
		unresolved: result.unresolved,
		warnings: result.warnings,
		errors: result.errors,
		confirmation: {
			level: result.confirmationLevel,
			reasons: result.confirmationReasons,
		},
	};
}
