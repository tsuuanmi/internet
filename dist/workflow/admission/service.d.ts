import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import type { AdmissionConfirmationInput, WorkflowAdmissionDraftInput, WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
import { type WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
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
    create(owner: WorkflowPrincipal, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord;
    get(owner: WorkflowPrincipal, admissionId: string): WorkflowAdmissionRecord | undefined;
    list(owner: WorkflowPrincipal): readonly WorkflowAdmissionRecord[];
    preflight(owner: WorkflowPrincipal, admissionId: string, expectedRevision: number): WorkflowAdmissionRecord;
    confirm(owner: WorkflowPrincipal, admissionId: string, expectedRevision: number, input: AdmissionConfirmationInput): WorkflowAdmissionRecord;
    activate(owner: WorkflowPrincipal, admissionId: string, expectedAcceptedSpecHash: string, activator: WorkflowAdmissionActivator): WorkflowAdmissionRecord;
    private requireOwned;
    private assertOwner;
    private assertAcceptedIdentity;
}
//# sourceMappingURL=service.d.ts.map