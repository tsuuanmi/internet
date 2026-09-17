export function createSoftwareAdmissionDraft(input) {
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
//# sourceMappingURL=software-admission.js.map