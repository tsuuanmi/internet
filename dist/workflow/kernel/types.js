export const WORKFLOW_RUN_SCHEMA = "@tsuuanmi/internet-workflow-run";
export const WORKFLOW_ARTIFACT_SCHEMA = "@tsuuanmi/internet-workflow-artifact";
export const WORKFLOW_WORK_ITEM_SCHEMA = "@tsuuanmi/internet-workflow-work-item";
export const WORKFLOW_INPUT_BUNDLE_SCHEMA = "@tsuuanmi/internet-workflow-input-bundle";
export const WORKFLOW_RUN_LIFECYCLES = [
    "CREATED",
    "ACTIVE",
    "WAITING_EXTERNAL",
    "BLOCKED",
    "COMPLETED",
    "CANCELLED",
];
export const WORKFLOW_WORK_ITEM_STATES = [
    "PENDING",
    "READY",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "FENCED",
];
export const WORKFLOW_SIDE_EFFECT_CLASSES = [
    "READ_ONLY",
    "CONTROLLED_MUTATION",
    "EXTERNAL_MUTATION",
    "HUMAN_AUTHORITY",
];
export const WORKFLOW_ARTIFACT_LINEAGE_RELATIONS = [
    "derived_from",
    "supports",
    "contradicts",
    "resolves",
    "supersedes",
    "invalidates",
    "consumes",
    "continues_from",
    "validates",
    "imports_from",
];
//# sourceMappingURL=types.js.map