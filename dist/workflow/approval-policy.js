export const WORKFLOW_CONFIRMATION_ACTIONS = [
    "create_branch",
    "write_file",
    "create_commit",
    "push_branch",
    "create_pull_request",
    "update_pull_request",
    "merge_pull_request",
];
export class WorkflowConfirmationError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowConfirmationError";
    }
}
const IMPLEMENTATION_ACTIONS = new Set([
    "create_branch",
    "write_file",
    "create_commit",
    "push_branch",
    "create_pull_request",
]);
const REMEDIATION_ACTIONS = new Set([
    "write_file",
    "create_commit",
    "push_branch",
    "update_pull_request",
]);
const BRANCH_BOUND_ACTIONS = new Set([
    "create_branch",
    "write_file",
    "create_commit",
    "push_branch",
    "create_pull_request",
    "update_pull_request",
]);
export function workflowWriterBranch(jobId) {
    if (!/^[0-9a-f]{32}$/u.test(jobId))
        throw new Error("workflow writer branch requires a valid job id");
    return `internet-workflow/${jobId}`;
}
export function normalizeGitHubRepository(value) {
    const trimmed = value.trim();
    const url = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/iu);
    if (url)
        return `${url[1]}/${url[2]}`.toLowerCase();
    const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
    return shorthand ? `${shorthand[1]}/${shorthand[2]}`.toLowerCase() : undefined;
}
function expectedBranch(context) {
    return context.pullRequest?.head ?? workflowWriterBranch(context.jobId);
}
function allowedActions(authority) {
    return authority === "IMPLEMENTATION" ? IMPLEMENTATION_ACTIONS : REMEDIATION_ACTIONS;
}
export function classifyWorkflowConfirmation(context, observation) {
    if (context.accountId !== "chatgpt-writer") {
        return { kind: "unknown", reason: "confirmation is not running on the workflow writer account" };
    }
    if (context.sessionId !== context.writerSessionId) {
        return { kind: "unknown", reason: "confirmation session does not match the active writer conversation" };
    }
    if (observation.action === undefined)
        return { kind: "unknown", reason: "confirmation action is not recognized" };
    const authoritativeRepository = normalizeGitHubRepository(context.repository);
    const observedRepository = observation.repository && normalizeGitHubRepository(observation.repository);
    if (authoritativeRepository === undefined || observedRepository === undefined) {
        return { kind: "unknown", reason: "confirmation repository is missing or unsupported" };
    }
    if (authoritativeRepository !== observedRepository) {
        return { kind: "unknown", reason: "confirmation repository does not match the workflow repository" };
    }
    if (context.pullRequest !== undefined &&
        normalizeGitHubRepository(context.pullRequest.repository) !== authoritativeRepository) {
        return { kind: "unknown", reason: "persisted pull-request repository does not match workflow authority" };
    }
    const allowed = allowedActions(context.authority);
    if (!allowed.has(observation.action)) {
        return {
            kind: "unknown",
            reason: `confirmation action is not permitted for ${context.authority.toLowerCase()} authority`,
        };
    }
    if (BRANCH_BOUND_ACTIONS.has(observation.action)) {
        if (observation.branch === undefined)
            return { kind: "unknown", reason: "confirmation branch identity is missing" };
        if (observation.branch !== expectedBranch(context)) {
            return { kind: "unknown", reason: "confirmation branch does not match the workflow branch" };
        }
    }
    if (observation.action === "update_pull_request") {
        if (context.pullRequest === undefined || observation.prNumber === undefined) {
            return { kind: "unknown", reason: "pull-request identity is missing for PR update" };
        }
        if (observation.prNumber !== context.pullRequest.number) {
            return { kind: "unknown", reason: "confirmation PR number does not match the workflow PR" };
        }
    }
    return { kind: "auto-approve", action: observation.action };
}
//# sourceMappingURL=approval-policy.js.map