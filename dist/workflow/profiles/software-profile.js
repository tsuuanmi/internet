function isFullSha(value) {
    return value !== undefined && /^[0-9a-f]{40}$/u.test(value);
}
function materialUserConfirmationReasons(draft) {
    const reasons = [];
    for (const [field, hint] of [
        ["temporal.deadline", draft.temporal?.deadline],
        ["temporal.duration", draft.temporal?.duration],
        ["budget.maxWallClockMs", draft.budget?.maxWallClockMs],
        ["budget.maxCostUsd", draft.budget?.maxCostUsd],
    ]) {
        if (hint?.provenance === "local_interpreted") {
            reasons.push({
                field,
                reason: "material execution limit was inferred by the Local Agent",
                proposedValue: hint.value,
                provenance: hint.provenance,
            });
        }
    }
    if (draft.authority?.externalPublication?.value === true &&
        draft.authority.externalPublication.provenance !== "user_explicit") {
        reasons.push({
            field: "authority.externalPublication",
            reason: "external publication authority requires explicit User confirmation",
            proposedValue: true,
            provenance: draft.authority.externalPublication.provenance,
        });
    }
    return reasons;
}
export const SOFTWARE_WORKFLOW_PROFILE = {
    id: "software_change",
    version: "1",
    preflightAdmission(draft) {
        const unresolved = [];
        const warnings = [];
        const defaults = [
            { field: "autonomy", value: "autonomous_until_external_dependency" },
            { field: "profile", value: "software_change" },
        ];
        const repository = draft.target?.repository?.value;
        const baseRevision = draft.target?.baseRevision?.value;
        if (repository === undefined || repository.trim() === "")
            unresolved.push("target.repository");
        if (!isFullSha(baseRevision))
            unresolved.push("target.baseRevision");
        if (draft.source.provenance === "local_interpreted") {
            warnings.push("legacy Local-Agent startup does not contain a separately captured raw User utterance");
        }
        const userReasons = materialUserConfirmationReasons(draft);
        if (userReasons.length > 0) {
            return {
                confirmationLevel: "USER_CONFIRM",
                confirmationReasons: userReasons,
                defaults,
                unresolved,
                warnings,
            };
        }
        if (draft.source.provenance === "local_interpreted") {
            return {
                confirmationLevel: "LOCAL_CONFIRM",
                confirmationReasons: [
                    {
                        field: "source.rawText",
                        reason: "workflow objective was supplied by the Local Agent rather than captured directly from User input",
                        proposedValue: draft.source.rawText,
                        provenance: "local_interpreted",
                    },
                ],
                defaults,
                unresolved,
                warnings,
            };
        }
        return {
            confirmationLevel: "AUTO_SUBMIT",
            confirmationReasons: [],
            defaults,
            unresolved,
            warnings,
        };
    },
};
//# sourceMappingURL=software-profile.js.map