import type { AdmissionConfirmationReason, WorkflowAdmissionConfirmationLevel, WorkflowAdmissionDraft } from "#internet/workflow/admission/types";
export interface WorkflowProfileAdmissionResult {
    readonly confirmationLevel: WorkflowAdmissionConfirmationLevel;
    readonly confirmationReasons: readonly AdmissionConfirmationReason[];
    readonly defaults: readonly {
        readonly field: string;
        readonly value: unknown;
    }[];
    readonly unresolved: readonly string[];
    readonly warnings: readonly string[];
}
export interface WorkflowProfileDescriptor {
    readonly id: string;
    readonly version: string;
    preflightAdmission(draft: WorkflowAdmissionDraft): WorkflowProfileAdmissionResult;
}
export declare class WorkflowProfileRegistryError extends Error {
    constructor(message: string);
}
export declare class WorkflowProfileRegistry {
    private readonly profiles;
    private readonly defaultProfileId;
    constructor(profiles: readonly WorkflowProfileDescriptor[], defaultProfileId: string);
    resolve(profileHint?: string): WorkflowProfileDescriptor;
}
//# sourceMappingURL=types.d.ts.map