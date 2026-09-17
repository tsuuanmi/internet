export const WORKFLOW_ADMISSION_PROVENANCE = [
    "user_explicit",
    "local_interpreted",
    "policy_default",
    "planner_derived",
    "system_observed",
];
export const WORKFLOW_ADMISSION_STATES = [
    "DRAFT",
    "PREFLIGHTED",
    "AWAITING_CONFIRMATION",
    "ACCEPTED",
    "ACTIVATING",
    "ACTIVATED",
];
export const WORKFLOW_ADMISSION_PREVIEW_STATUSES = [
    "INCOMPLETE",
    "REJECTED",
    "READY",
    "CONFIRMATION_REQUIRED",
];
export const WORKFLOW_ADMISSION_CONFIRMATION_LEVELS = ["AUTO_SUBMIT", "LOCAL_CONFIRM", "USER_CONFIRM"];
export const WORKFLOW_ADMISSION_SOURCE_KINDS = ["user", "local_agent"];
export const WORKFLOW_ADMISSION_TARGET_KINDS = ["workflow_job"];
//# sourceMappingURL=types.js.map