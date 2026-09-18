export function fenceWorkflowExecution(executions, execution, now, code, message) {
    const current = executions.get(execution.runId, execution.executionId);
    if (current === undefined || current.state !== "RUNNING")
        return undefined;
    const at = new Date(now()).toISOString();
    return executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
        ...value,
        revision: value.revision + 1,
        state: "FENCED",
        finishedAt: at,
        failure: { code, message, retryable: true },
    }));
}
export function failWorkflowExecution(executions, execution, now, code, message, retryable) {
    const current = executions.get(execution.runId, execution.executionId);
    if (current === undefined || current.state !== "RUNNING")
        return undefined;
    const at = new Date(now()).toISOString();
    return executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
        ...value,
        revision: value.revision + 1,
        state: "FAILED",
        finishedAt: at,
        failure: { code, message, retryable },
    }));
}
function transitionWorkItem(workItems, runId, workItemId, now, from, to) {
    const item = workItems.get(runId, workItemId);
    if (item === undefined || !from.includes(item.state))
        return;
    workItems.update(runId, workItemId, item.revision, (current) => ({
        ...current,
        revision: current.revision + 1,
        state: to,
        updatedAt: new Date(now()).toISOString(),
    }));
}
export function setWorkflowWorkItemReady(workItems, runId, workItemId, now) {
    transitionWorkItem(workItems, runId, workItemId, now, ["RUNNING"], "READY");
}
export function setWorkflowWorkItemFailed(workItems, runId, workItemId, now) {
    transitionWorkItem(workItems, runId, workItemId, now, ["RUNNING"], "FAILED");
}
export function fenceWorkflowWorkItem(workItems, runId, workItemId, now) {
    transitionWorkItem(workItems, runId, workItemId, now, ["READY", "RUNNING", "COMPLETED"], "FENCED");
}
//# sourceMappingURL=execution-state.js.map