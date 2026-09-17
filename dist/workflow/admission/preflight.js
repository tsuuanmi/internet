import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
export class WorkflowAdmissionPreflightError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAdmissionPreflightError";
    }
}
export function preflightWorkflowAdmission(admissionId, draft, draftHash, profiles) {
    parseWorkflowAdmissionDraft(draft);
    const profile = profiles.resolve(draft.profileHint?.value);
    const result = profile.preflightAdmission(draft);
    if (result.unresolved.length > 0) {
        throw new WorkflowAdmissionPreflightError(`workflow admission has unresolved required fields: ${result.unresolved.join(", ")}`);
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
//# sourceMappingURL=preflight.js.map