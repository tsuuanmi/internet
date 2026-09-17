import type { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import type { AcceptedAdmissionSpec, AdmissionActivation, AdmissionConfirmationInput, WorkflowAdmissionDraftInput, WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";
export interface WorkflowAdmissionOwner {
    readonly kind: string;
    readonly id: string;
}
export interface WorkflowAdmissionLifecycleOptions {
    readonly now?: () => Date;
    readonly createId?: () => string;
}
export declare class WorkflowAdmissionServiceError extends Error {
    constructor(message: string);
}
export declare class WorkflowAdmissionService {
    private readonly store;
    private readonly profiles;
    private readonly now;
    private readonly createId;
    constructor(store: WorkflowAdmissionStore, profiles: WorkflowProfileRegistry, options?: WorkflowAdmissionLifecycleOptions);
    create(owner: WorkflowAdmissionOwner, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord;
    get(admissionId: string): WorkflowAdmissionRecord | undefined;
    list(): readonly WorkflowAdmissionRecord[];
    preflight(admissionId: string, expectedRevision: number): WorkflowAdmissionRecord;
    confirm(owner: WorkflowAdmissionOwner, admissionId: string, expectedRevision: number, input: AdmissionConfirmationInput): WorkflowAdmissionRecord;
    activate<T>(owner: WorkflowAdmissionOwner, admissionId: string, expectedRevision: number, expectedAcceptedSpecHash: string, activator: (spec: AcceptedAdmissionSpec) => AdmissionActivation<T>): {
        readonly record: WorkflowAdmissionRecord;
        readonly result: T;
    };
}
//# sourceMappingURL=service.d.ts.map