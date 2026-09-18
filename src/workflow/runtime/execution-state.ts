import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowExecution } from "#internet/workflow/runtime/types";

export function fenceWorkflowExecution(
	executions: WorkflowExecutionStore,
	execution: WorkflowExecution,
	now: () => number,
	code: string,
	message: string,
): WorkflowExecution | undefined {
	const current = executions.get(execution.runId, execution.executionId);
	if (current === undefined || current.state !== "RUNNING") return undefined;
	const at = new Date(now()).toISOString();
	return executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
		...value,
		revision: value.revision + 1,
		state: "FENCED",
		finishedAt: at,
		failure: { code, message, retryable: true },
	}));
}

export function failWorkflowExecution(
	executions: WorkflowExecutionStore,
	execution: WorkflowExecution,
	now: () => number,
	code: string,
	message: string,
	retryable: boolean,
): WorkflowExecution | undefined {
	const current = executions.get(execution.runId, execution.executionId);
	if (current === undefined || current.state !== "RUNNING") return undefined;
	const at = new Date(now()).toISOString();
	return executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
		...value,
		revision: value.revision + 1,
		state: "FAILED",
		finishedAt: at,
		failure: { code, message, retryable },
	}));
}

function transitionWorkItem(
	workItems: WorkflowWorkItemStore,
	runId: string,
	workItemId: string,
	now: () => number,
	from: readonly string[],
	to: "READY" | "FAILED" | "FENCED",
): void {
	const item = workItems.get(runId, workItemId);
	if (item === undefined || !from.includes(item.state)) return;
	workItems.update(runId, workItemId, item.revision, (current) => ({
		...current,
		revision: current.revision + 1,
		state: to,
		updatedAt: new Date(now()).toISOString(),
	}));
}

export function setWorkflowWorkItemReady(
	workItems: WorkflowWorkItemStore,
	runId: string,
	workItemId: string,
	now: () => number,
): void {
	transitionWorkItem(workItems, runId, workItemId, now, ["RUNNING"], "READY");
}

export function setWorkflowWorkItemFailed(
	workItems: WorkflowWorkItemStore,
	runId: string,
	workItemId: string,
	now: () => number,
): void {
	transitionWorkItem(workItems, runId, workItemId, now, ["RUNNING"], "FAILED");
}

export function fenceWorkflowWorkItem(
	workItems: WorkflowWorkItemStore,
	runId: string,
	workItemId: string,
	now: () => number,
): void {
	transitionWorkItem(workItems, runId, workItemId, now, ["READY", "RUNNING", "SUCCEEDED"], "FENCED");
}
