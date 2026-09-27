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
] as const;

export type WorkflowComponentErrorCode = (typeof WORKFLOW_COMPONENT_ERROR_CODES)[number];

export interface WorkflowComponentContractRef {
	readonly id: string;
	readonly version: string;
}

export function assertWorkflowComponentContractRef(
	value: WorkflowComponentContractRef,
): asserts value is WorkflowComponentContractRef {
	if (value.id.trim() === "") throw new WorkflowComponentError("INVALID_INPUT", "workflow component contract id is required");
	if (value.version.trim() === "")
		throw new WorkflowComponentError("INVALID_INPUT", "workflow component contract version is required");
}

export class WorkflowComponentError extends Error {
	readonly code: WorkflowComponentErrorCode;

	constructor(code: WorkflowComponentErrorCode, message: string) {
		super(message);
		this.name = "WorkflowComponentError";
		this.code = code;
	}
}
