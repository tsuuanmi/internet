export declare const WORKFLOW_PRINCIPAL_KINDS: readonly ["session", "user", "service"];
export type WorkflowPrincipalKind = (typeof WORKFLOW_PRINCIPAL_KINDS)[number];
export interface WorkflowPrincipal {
    readonly kind: WorkflowPrincipalKind;
    readonly id: string;
}
export interface WorkflowAuthorizationContext {
    readonly principal: WorkflowPrincipal;
    readonly ownerSessionId?: string;
}
export declare class WorkflowAuthorizationError extends Error {
    constructor(message: string);
}
export declare function assertWorkflowPrincipal(principal: WorkflowPrincipal): void;
export declare function workflowPrincipalEquals(left: WorkflowPrincipal, right: WorkflowPrincipal): boolean;
export declare function workflowSessionAuthorizationContext(sessionId: string): WorkflowAuthorizationContext;
export declare function requireWorkflowOwnerSessionId(context: WorkflowAuthorizationContext): string;
//# sourceMappingURL=authorization.d.ts.map