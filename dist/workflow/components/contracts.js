export const WORKFLOW_COMPONENT_ERROR_CODES = [
    "INVALID_INPUT",
    "UNSUPPORTED_VERSION",
    "NOT_FOUND",
    "CONFLICT",
    "STALE_BINDING",
    "NOT_AUTHORIZED",
    "DEPENDENCY_UNAVAILABLE",
    "TRANSIENT_FAILURE",
    "PERMANENT_FAILURE",
    "CANCELLED",
    "TIMEOUT",
    "UNCERTAIN_SIDE_EFFECT",
];
export function assertWorkflowComponentContractRef(value) {
    if (value.id.trim() === "")
        throw new WorkflowComponentError("INVALID_INPUT", "workflow component contract id is required");
    if (value.version.trim() === "")
        throw new WorkflowComponentError("INVALID_INPUT", "workflow component contract version is required");
}
export class WorkflowComponentError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "WorkflowComponentError";
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map