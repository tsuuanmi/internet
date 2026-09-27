import {
	assertWorkflowComponentContractRef,
	WorkflowComponentError,
	type WorkflowComponentContractRef,
} from "#internet/workflow/components/contracts";

export const WORKFLOW_TASK_START_REQUEST_SCHEMA = "@tsuuanmi/internet-workflow-task-start-request" as const;
export const WORKFLOW_TASK_HANDLE_SCHEMA = "@tsuuanmi/internet-workflow-task-handle" as const;

export const WORKFLOW_TASK_STATUSES = [
	"working",
	"input_required",
	"completed",
	"failed",
	"cancelled",
] as const;

export type WorkflowTaskStatus = (typeof WORKFLOW_TASK_STATUSES)[number];

export interface WorkflowTaskStartRequestV1 {
	readonly schema: typeof WORKFLOW_TASK_START_REQUEST_SCHEMA;
	readonly version: 1;
	readonly requestId: string;
	readonly ownerRef: string;
	readonly operation: WorkflowComponentContractRef;
	readonly subjectRef?: string;
	readonly inputRef?: string;
	readonly deadline?: string;
}

export interface WorkflowTaskHandleV1 {
	readonly schema: typeof WORKFLOW_TASK_HANDLE_SCHEMA;
	readonly version: 1;
	readonly taskId: string;
	readonly subjectRef?: string;
	readonly status: WorkflowTaskStatus;
	readonly pollAfterMs?: number;
}

function assertNonEmpty(value: string, label: string): void {
	if (value.trim() === "") throw new WorkflowComponentError("INVALID_INPUT", `workflow task ${label} is required`);
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
	if (value !== undefined) assertNonEmpty(value, label);
}

export function assertWorkflowTaskStartRequest(
	value: WorkflowTaskStartRequestV1,
): asserts value is WorkflowTaskStartRequestV1 {
	if (value.schema !== WORKFLOW_TASK_START_REQUEST_SCHEMA || value.version !== 1) {
		throw new WorkflowComponentError("UNSUPPORTED_VERSION", "workflow task start request contract is unsupported");
	}
	assertNonEmpty(value.requestId, "request id");
	assertNonEmpty(value.ownerRef, "owner ref");
	assertWorkflowComponentContractRef(value.operation);
	assertOptionalNonEmpty(value.subjectRef, "subject ref");
	assertOptionalNonEmpty(value.inputRef, "input ref");
	assertOptionalNonEmpty(value.deadline, "deadline");
}

export function assertWorkflowTaskHandle(value: WorkflowTaskHandleV1): asserts value is WorkflowTaskHandleV1 {
	if (value.schema !== WORKFLOW_TASK_HANDLE_SCHEMA || value.version !== 1) {
		throw new WorkflowComponentError("UNSUPPORTED_VERSION", "workflow task handle contract is unsupported");
	}
	assertNonEmpty(value.taskId, "task id");
	assertOptionalNonEmpty(value.subjectRef, "subject ref");
	if (!WORKFLOW_TASK_STATUSES.includes(value.status)) {
		throw new WorkflowComponentError("INVALID_INPUT", `workflow task status ${String(value.status)} is invalid`);
	}
	if (value.subjectRef !== undefined && value.taskId === value.subjectRef) {
		throw new WorkflowComponentError("INVALID_INPUT", "workflow task id must not equal subject ref");
	}
	if (value.pollAfterMs !== undefined && (!Number.isInteger(value.pollAfterMs) || value.pollAfterMs <= 0)) {
		throw new WorkflowComponentError("INVALID_INPUT", "workflow task poll interval must be a positive integer");
	}
}
