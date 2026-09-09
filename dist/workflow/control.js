export const WORKFLOW_CONTROL_KINDS = [
    "START_IMPLEMENTATION",
    "APPLY_REVIEWS",
    "RETRY",
    "CHECK_PR_HEALTH",
    "MERGE_AUTHORIZED",
];
export function createWorkflowControlMessage(kind, jobId, expectedHeadSha) {
    if (!/^[0-9a-f]{32}$/u.test(jobId))
        throw new Error("workflow control message requires a valid job id");
    if (expectedHeadSha !== undefined && !/^[0-9a-f]{40}$/u.test(expectedHeadSha)) {
        throw new Error("workflow control message expectedHeadSha must be a full Git SHA");
    }
    return {
        kind,
        jobId,
        createdAt: new Date().toISOString(),
        ...(expectedHeadSha === undefined ? {} : { expectedHeadSha }),
    };
}
//# sourceMappingURL=control.js.map