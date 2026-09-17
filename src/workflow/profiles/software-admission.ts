import type { WorkflowAdmissionDraftInput, WorkflowAdmissionProvenance } from "#internet/workflow/admission/types";

export interface SoftwareAdmissionInput {
	readonly rawSource: string;
	readonly sourceProvenance: "user_explicit" | "local_interpreted";
	readonly repository: string;
	readonly baseRevision: string;
	readonly targetProvenance: Extract<WorkflowAdmissionProvenance, "system_observed" | "local_interpreted">;
	readonly authorityProvenance: Extract<WorkflowAdmissionProvenance, "user_explicit" | "local_interpreted">;
}

export function createSoftwareAdmissionDraft(input: SoftwareAdmissionInput): WorkflowAdmissionDraftInput {
	return {
		source: {
			kind: input.sourceProvenance === "user_explicit" ? "user" : "local_agent",
			rawText: input.rawSource,
			provenance: input.sourceProvenance,
		},
		profileHint: { value: "software_change", provenance: "policy_default" },
		target: {
			repository: { value: input.repository, provenance: input.targetProvenance },
			baseRevision: { value: input.baseRevision, provenance: input.targetProvenance },
		},
		authority: {
			repositoryMutation: { value: true, provenance: input.authorityProvenance },
		},
		autonomy: { value: "autonomous_until_external_dependency", provenance: "policy_default" },
	};
}
