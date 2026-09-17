export const WORKFLOW_SEMANTIC_ARTIFACT_TYPES = {
    objective: "objective",
    acceptanceCriteria: "acceptance_criteria",
    plan: "plan",
    need: "need",
    finding: "finding",
    evidence: "evidence",
    criterionAssessment: "criterion_assessment",
    report: "report",
    delivery: "delivery",
    userFeedback: "user_feedback",
};
export const WORKFLOW_SEMANTIC_SCHEMA_VERSION = "1";
export const WORKFLOW_SEMANTIC_SCHEMA_REFS = {
    objective: { id: "workflow.objective", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    acceptanceCriteria: { id: "workflow.acceptance-criteria", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    plan: { id: "workflow.plan", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    need: { id: "workflow.need", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    finding: { id: "workflow.finding", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    evidence: { id: "workflow.evidence", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    criterionAssessment: { id: "workflow.criterion-assessment", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    report: { id: "workflow.report", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    delivery: { id: "workflow.delivery", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
    userFeedback: { id: "workflow.user-feedback", version: WORKFLOW_SEMANTIC_SCHEMA_VERSION },
};
export const WORKFLOW_CRITERION_PROVENANCE = ["user", "policy", "planner_derived"];
export const WORKFLOW_CRITERION_REVISION_AUTHORITIES = ["user", "policy", "planner"];
export const WORKFLOW_ASSESSMENT_METHODS = ["deterministic", "reviewer", "user"];
export const WORKFLOW_ASSESSMENT_VERDICTS = ["SATISFIED", "UNSATISFIED", "INCONCLUSIVE"];
export const WORKFLOW_NEED_TYPES = [
    "planning",
    "execution",
    "plan_change",
    "requirements_change",
    "clarification",
];
export const WORKFLOW_FINDING_SEVERITIES = ["info", "warning", "blocking"];
export const WORKFLOW_FEEDBACK_PROVENANCE = ["user_explicit", "local_agent", "system_observed"];
//# sourceMappingURL=types.js.map