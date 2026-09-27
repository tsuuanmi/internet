export declare const WORKFLOW_COMPONENT_ERROR_CODES: readonly ["INVALID_INPUT", "UNSUPPORTED_VERSION", "NOT_FOUND", "CONFLICT", "STALE_BINDING", "NOT_AUTHORIZED", "DEPENDENCY_UNAVAILABLE", "TRANSIENT_FAILURE", "PERMANENT_FAILURE", "CANCELLED", "TIMEOUT", "UNCERTAIN_SIDE_EFFECT"];
export type WorkflowComponentErrorCode = (typeof WORKFLOW_COMPONENT_ERROR_CODES)[number];
export interface WorkflowComponentContractRef {
    readonly id: string;
    readonly version: string;
}
export declare function assertWorkflowComponentContractRef(value: WorkflowComponentContractRef): asserts value is WorkflowComponentContractRef;
export declare class WorkflowComponentError extends Error {
    readonly code: WorkflowComponentErrorCode;
    constructor(code: WorkflowComponentErrorCode, message: string);
}
//# sourceMappingURL=contracts.d.ts.map