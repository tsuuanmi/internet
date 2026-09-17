import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/types";
import { parseWorkflowAcceptanceCriteriaPayload, parseWorkflowFindingPayload, parseWorkflowNeedPayload, parseWorkflowObjectivePayload, parseWorkflowPlanPayload, } from "#internet/workflow/semantic/validation";
export const WORKFLOW_PLANNING_MODES = ["INITIAL", "PLAN_CHANGE", "REQUIREMENTS_CHANGE", "CLARIFICATION"];
export const WORKFLOW_PLANNING_INPUT_SCHEMA = { id: "workflow.planning.input", version: "1" };
export const WORKFLOW_PLANNING_OUTPUT_SCHEMA = { id: "workflow.planning.output", version: "1" };
export const WORKFLOW_PLANNING_CAPABILITY = {
    id: "planning",
    version: "1",
    acceptedNeedTypes: ["planning", "plan_change", "requirements_change", "clarification"],
    producedArtifactTypes: [
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective,
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.plan,
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
    ],
    producedReceiptTypes: [],
    sideEffect: "READ_ONLY",
    requiredAuthority: [],
    executorKinds: ["reasoning"],
    inputSchema: WORKFLOW_PLANNING_INPUT_SCHEMA,
    outputSchema: WORKFLOW_PLANNING_OUTPUT_SCHEMA,
    policyHooks: ["criterion_revision_authority", "clarification"],
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseMode(value) {
    if (typeof value !== "string" || !WORKFLOW_PLANNING_MODES.includes(value)) {
        throw new Error("invalid workflow planning mode");
    }
    return value;
}
function parseList(value, label, parse) {
    if (!Array.isArray(value))
        throw new Error(`invalid ${label}`);
    return value.map(parse);
}
export function parseWorkflowPlanningOutput(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow planning output");
    const mode = parseMode(value.mode);
    const objective = value.objective === undefined ? undefined : parseWorkflowObjectivePayload(value.objective);
    const acceptanceCriteria = value.acceptanceCriteria === undefined
        ? undefined
        : parseWorkflowAcceptanceCriteriaPayload(value.acceptanceCriteria);
    const plan = value.plan === undefined ? undefined : parseWorkflowPlanPayload(value.plan);
    const needs = parseList(value.needs, "workflow planning Needs", parseWorkflowNeedPayload);
    const findings = parseList(value.findings, "workflow planning Findings", parseWorkflowFindingPayload);
    switch (mode) {
        case "INITIAL":
            if (objective === undefined || acceptanceCriteria === undefined || plan === undefined)
                throw new Error("initial workflow planning requires Objective, AcceptanceCriteria, and Plan outputs");
            break;
        case "PLAN_CHANGE":
            if (plan === undefined)
                throw new Error("workflow plan change requires a Plan output");
            if (objective !== undefined || acceptanceCriteria !== undefined)
                throw new Error("workflow plan change cannot revise Objective or AcceptanceCriteria");
            break;
        case "REQUIREMENTS_CHANGE":
            if (objective === undefined && acceptanceCriteria === undefined)
                throw new Error("workflow requirements change requires Objective or AcceptanceCriteria output");
            break;
        case "CLARIFICATION":
            if (objective !== undefined || acceptanceCriteria !== undefined || plan !== undefined)
                throw new Error("workflow clarification cannot revise semantic requirements or Plan directly");
            if (needs.length === 0 && findings.length === 0)
                throw new Error("workflow clarification requires a typed Need or Finding");
            break;
    }
    return { mode, objective, acceptanceCriteria, plan, needs, findings };
}
export async function executeWorkflowPlanning(executor, request) {
    if (request.inputBundle.capability.id !== WORKFLOW_PLANNING_CAPABILITY.id ||
        request.inputBundle.capability.version !== WORKFLOW_PLANNING_CAPABILITY.version)
        throw new Error("workflow planning requires an InputBundle bound to the planning capability");
    return parseWorkflowPlanningOutput(await executor.execute(request));
}
//# sourceMappingURL=planning.js.map