export const RESEARCH_WORKFLOW_PROFILE_ID = "deep_research";
export const RESEARCH_WORKFLOW_PROFILE = {
    id: RESEARCH_WORKFLOW_PROFILE_ID,
    version: "1",
    preflightAdmission(draft) {
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
                    ? [{ field: "profile", value: RESEARCH_WORKFLOW_PROFILE_ID, provenance: "policy_default" }]
                    : []),
                ...(draft.autonomy === undefined
                    ? [
                        {
                            field: "autonomy",
                            value: "autonomous_until_external_dependency",
                            provenance: "policy_default",
                        },
                    ]
                    : []),
            ],
            unresolved: [],
            warnings: [],
            errors: draft.authority?.repositoryMutation?.value === true
                ? ["deep_research does not accept repository mutation authority"]
                : [],
        };
    },
};
//# sourceMappingURL=profile.js.map