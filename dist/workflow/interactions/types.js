export const WORKFLOW_PENDING_ACTION_SCHEMA = "@tsuuanmi/internet-workflow-pending-action";
export const WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA = "@tsuuanmi/internet-workflow-pending-action-response";
export const WORKFLOW_EXTERNAL_SIGNAL_SCHEMA = "@tsuuanmi/internet-workflow-external-signal";
export const WORKFLOW_PENDING_ACTION_STATES = [
    "PENDING",
    "RESOLVED",
    "REJECTED",
    "EXPIRED",
    "CANCELLED",
    "SUPERSEDED",
];
export const WORKFLOW_RESPONDER_POLICIES = ["USER_AUTHORITY", "LOCAL_AGENT_INPUT", "USER_OR_LOCAL"];
export const WORKFLOW_RESPONSE_PROVENANCE = ["user_explicit", "local_agent", "operator", "system_policy"];
export const WORKFLOW_PENDING_ACTION_TIMEOUT_POLICIES = [
    "WAIT_INDEFINITELY",
    "FAIL_CLOSED",
    "DEFAULT_REJECT",
    "ESCALATE_TO_USER",
    "CANCEL_DEPENDENT_BRANCH",
];
//# sourceMappingURL=types.js.map