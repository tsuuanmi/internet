import type { WorkflowAdmissionDraft } from "#internet/workflow/admission/types";
import type { WorkflowProfileDescriptor } from "#internet/workflow/profiles/types";

export const RESEARCH_WORKFLOW_PROFILE_ID = "deep_research" as const;

export const RESEARCH_WORKFLOW_PROFILE: WorkflowProfileDescriptor = {
	id: RESEARCH_WORKFLOW_PROFILE_ID,
	version: "1",
	preflightAdmission(draft: WorkflowAdmissionDraft) {
		const local = draft.source.provenance === "local_interpreted";
		return {
			confirmationLevel: local ? "LOCAL_CONFIRM" : "AUTO_SUBMIT",
			confirmationReasons: local
				? [
						{
							field: "source.rawText",
							reason: "research objective was interpreted by the Local Agent",
							proposedValue: draft.source.rawText,
							provenance: "local_interpreted",
						},
					]
				: [],
			defaults: [
				...(draft.profileHint === undefined
					? [{ field: "profile", value: RESEARCH_WORKFLOW_PROFILE_ID, provenance: "policy_default" as const }]
					: []),
				...(draft.autonomy === undefined
					? [
							{
								field: "autonomy",
								value: "autonomous_until_external_dependency",
								provenance: "policy_default" as const,
							},
						]
					: []),
			],
			unresolved: [],
			warnings: [],
			errors:
				draft.authority?.repositoryMutation?.value === true
					? ["deep_research does not accept repository mutation authority"]
					: [],
		};
	},
};
