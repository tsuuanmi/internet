import type {
	AdmissionConfirmationReason,
	AdmissionDefault,
	WorkflowAdmissionDraft,
} from "#internet/workflow/admission/types";
import type { WorkflowProfileDescriptor } from "#internet/workflow/profiles/types";

function fullSha(value: string): boolean {
	return /^[0-9a-f]{40}$/u.test(value);
}

function policyDefaults(draft: WorkflowAdmissionDraft): AdmissionDefault[] {
	const defaults: AdmissionDefault[] = [];
	if (draft.profileHint === undefined) {
		defaults.push({ field: "profile", value: "software_change", provenance: "policy_default" });
	}
	if (draft.autonomy === undefined) {
		defaults.push({
			field: "autonomy",
			value: "autonomous_until_external_dependency",
			provenance: "policy_default",
		});
	}
	return defaults;
}

function userConfirmationReasons(draft: WorkflowAdmissionDraft): AdmissionConfirmationReason[] {
	const reasons: AdmissionConfirmationReason[] = [];
	for (const [field, hint] of [
		["temporal.deadline", draft.temporal?.deadline],
		["temporal.duration", draft.temporal?.duration],
		["budget.maxWallClockMs", draft.budget?.maxWallClockMs],
		["budget.maxCostUsd", draft.budget?.maxCostUsd],
	] as const) {
		if (hint?.provenance === "local_interpreted") {
			reasons.push({
				field,
				reason: "material execution limit was inferred by the Local Agent",
				proposedValue: hint.value,
				provenance: hint.provenance,
			});
		}
	}
	if (
		draft.authority?.externalPublication?.value === true &&
		draft.authority.externalPublication.provenance !== "user_explicit"
	) {
		reasons.push({
			field: "authority.externalPublication",
			reason: "external publication authority requires explicit User confirmation",
			proposedValue: true,
			provenance: draft.authority.externalPublication.provenance,
		});
	}
	return reasons;
}

function localConfirmationReasons(draft: WorkflowAdmissionDraft): AdmissionConfirmationReason[] {
	const reasons: AdmissionConfirmationReason[] = [];
	if (draft.source.provenance === "local_interpreted") {
		reasons.push({
			field: "source.rawText",
			reason: "workflow source was supplied by the Local Agent rather than captured directly from User input",
			proposedValue: draft.source.rawText,
			provenance: "local_interpreted",
		});
	}
	if (
		draft.authority?.repositoryMutation?.value === true &&
		draft.authority.repositoryMutation.provenance === "local_interpreted"
	) {
		reasons.push({
			field: "authority.repositoryMutation",
			reason: "repository mutation authority was interpreted by the Local Agent",
			proposedValue: true,
			provenance: "local_interpreted",
		});
	}
	return reasons;
}

export const SOFTWARE_WORKFLOW_PROFILE: WorkflowProfileDescriptor = {
	id: "software_change",
	version: "1",
	preflightAdmission(draft) {
		const unresolved: string[] = [];
		const warnings: string[] = [];
		const errors: string[] = [];
		const repository = draft.target?.repository?.value;
		const baseRevision = draft.target?.baseRevision?.value;
		const repositoryMutation = draft.authority?.repositoryMutation;

		if (repository === undefined || repository.trim() === "") unresolved.push("target.repository");
		if (baseRevision === undefined || baseRevision.trim() === "") unresolved.push("target.baseRevision");
		else if (!fullSha(baseRevision)) errors.push("target.baseRevision must be a full lowercase Git SHA");
		if (repositoryMutation === undefined) unresolved.push("authority.repositoryMutation");
		else if (repositoryMutation.value !== true) errors.push("software_change requires repository mutation authority");
		if (draft.source.provenance === "local_interpreted") {
			warnings.push("raw User source was not captured separately from Local-Agent interpretation");
		}

		const userReasons = userConfirmationReasons(draft);
		const localReasons = localConfirmationReasons(draft);
		const confirmationLevel = userReasons.length > 0 ? "USER_CONFIRM" : localReasons.length > 0 ? "LOCAL_CONFIRM" : "AUTO_SUBMIT";
		const confirmationReasons = userReasons.length > 0 ? userReasons : localReasons;

		return {
			confirmationLevel,
			confirmationReasons,
			defaults: policyDefaults(draft),
			unresolved,
			warnings,
			errors,
		};
	},
};
