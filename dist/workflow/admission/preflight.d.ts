import type { AdmissionPreview, WorkflowAdmissionDraft } from "#internet/workflow/admission/types";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";
export declare class WorkflowAdmissionPreflightError extends Error {
    constructor(message: string);
}
export declare function preflightWorkflowAdmission(admissionId: string, draft: WorkflowAdmissionDraft, draftHash: string, profiles: WorkflowProfileRegistry): AdmissionPreview;
//# sourceMappingURL=preflight.d.ts.map