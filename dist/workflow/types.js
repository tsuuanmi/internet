export const WORKFLOW_PENDING_ACTION_KINDS = [
    "WRITER_BLOCKED",
    "UNKNOWN_CONFIRMATION",
    "REVIEW_LIMIT_REACHED",
    "ACCOUNT_REAUTH_REQUIRED",
    "USER_ACTION_REQUIRED",
    "CODE_FIX_REQUIRED",
];
export const TERMINAL_WORKFLOW_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);
export function workflowJobIsTerminal(job) {
    return TERMINAL_WORKFLOW_LIFECYCLES.has(job.graph.lifecycle);
}
//# sourceMappingURL=types.js.map