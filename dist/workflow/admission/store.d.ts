import type { WorkflowAdmissionRecord } from "#internet/workflow/admission/types";
export declare class WorkflowAdmissionStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowAdmissionStore {
    private readonly admissionsDir;
    constructor(dataDir: string);
    pathFor(admissionId: string): string;
    create(record: WorkflowAdmissionRecord): WorkflowAdmissionRecord;
    get(admissionId: string): WorkflowAdmissionRecord | undefined;
    list(): readonly WorkflowAdmissionRecord[];
    update(admissionId: string, expectedRevision: number, mutate: (current: WorkflowAdmissionRecord) => WorkflowAdmissionRecord): WorkflowAdmissionRecord;
}
//# sourceMappingURL=store.d.ts.map