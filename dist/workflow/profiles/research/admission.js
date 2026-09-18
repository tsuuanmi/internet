import { RESEARCH_WORKFLOW_PROFILE_ID } from "#internet/workflow/profiles/research/profile";
export function createResearchAdmissionDraft(input) {
    return {
        source: {
            kind: input.sourceProvenance === "user_explicit" ? "user" : "local_agent",
            rawText: input.rawSource,
            provenance: input.sourceProvenance,
        },
        profileHint: { value: RESEARCH_WORKFLOW_PROFILE_ID, provenance: "policy_default" },
        autonomy: { value: "autonomous_until_external_dependency", provenance: "policy_default" },
    };
}
//# sourceMappingURL=admission.js.map