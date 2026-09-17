export const WORKFLOW_PRINCIPAL_KINDS = ["session", "user", "service"];
export class WorkflowAuthorizationError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAuthorizationError";
    }
}
export function assertWorkflowPrincipal(principal) {
    if (!WORKFLOW_PRINCIPAL_KINDS.includes(principal.kind) || principal.id.trim() === "") {
        throw new WorkflowAuthorizationError("workflow principal is required");
    }
}
export function workflowPrincipalEquals(left, right) {
    return left.kind === right.kind && left.id === right.id;
}
export function workflowSessionAuthorizationContext(sessionId) {
    if (sessionId.trim() === "")
        throw new WorkflowAuthorizationError("workflow session principal id is required");
    return {
        principal: { kind: "session", id: sessionId },
        ownerSessionId: sessionId,
    };
}
export function requireWorkflowOwnerSessionId(context) {
    assertWorkflowPrincipal(context.principal);
    const ownerSessionId = context.ownerSessionId;
    if (ownerSessionId === undefined || ownerSessionId.trim() === "") {
        throw new WorkflowAuthorizationError("workflow operation requires an owner session binding");
    }
    return ownerSessionId;
}
//# sourceMappingURL=authorization.js.map