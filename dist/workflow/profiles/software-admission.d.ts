import type { WorkflowAdmissionDraftInput, WorkflowAdmissionProvenance } from "#internet/workflow/admission/types";
export interface SoftwareAdmissionInput {
    readonly rawSource: string;
    readonly sourceProvenance: "user_explicit" | "local_interpreted";
    readonly repository: string;
    readonly baseRevision: string;
    readonly targetProvenance: Extract<WorkflowAdmissionProvenance, "system_observed" | "local_interpreted">;
    readonly authorityProvenance: Extract<WorkflowAdmissionProvenance, "user_explicit" | "local_interpreted">;
}
export declare function createSoftwareAdmissionDraft(input: SoftwareAdmissionInput): WorkflowAdmissionDraftInput;
//# sourceMappingURL=software-admission.d.ts.map