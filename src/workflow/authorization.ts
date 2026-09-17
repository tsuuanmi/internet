export const WORKFLOW_PRINCIPAL_KINDS = ["session", "user", "service"] as const;
export type WorkflowPrincipalKind = (typeof WORKFLOW_PRINCIPAL_KINDS)[number];

export interface WorkflowPrincipal {
	readonly kind: WorkflowPrincipalKind;
	readonly id: string;
}

export interface WorkflowAuthorizationContext {
	readonly principal: WorkflowPrincipal;
	readonly ownerSessionId?: string;
}

export class WorkflowAuthorizationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowAuthorizationError";
	}
}

export function assertWorkflowPrincipal(principal: WorkflowPrincipal): void {
	if (!WORKFLOW_PRINCIPAL_KINDS.includes(principal.kind) || principal.id.trim() === "") {
		throw new WorkflowAuthorizationError("workflow principal is required");
	}
}

export function workflowPrincipalEquals(left: WorkflowPrincipal, right: WorkflowPrincipal): boolean {
	return left.kind === right.kind && left.id === right.id;
}

export function workflowSessionAuthorizationContext(sessionId: string): WorkflowAuthorizationContext {
	if (sessionId.trim() === "") throw new WorkflowAuthorizationError("workflow session principal id is required");
	return {
		principal: { kind: "session", id: sessionId },
		ownerSessionId: sessionId,
	};
}

export function requireWorkflowOwnerSessionId(context: WorkflowAuthorizationContext): string {
	assertWorkflowPrincipal(context.principal);
	const ownerSessionId = context.ownerSessionId;
	if (ownerSessionId === undefined || ownerSessionId.trim() === "") {
		throw new WorkflowAuthorizationError("workflow operation requires an owner session binding");
	}
	return ownerSessionId;
}
