import { criterionAssessmentIsCurrent } from "#internet/workflow/semantic/assessment";
export const WORKFLOW_CONVERGENCE_BLOCKER_KINDS = [
    "criterion",
    "finding",
    "deliverable",
    "authority",
    "receipt",
    "dependency",
    "plan_task",
];
function unique(values) {
    return [...new Set(values)];
}
function planTaskKey(task) {
    return `${task.planArtifact.runId}:${task.planArtifact.artifactId}:${task.taskId}`;
}
function criterionKey(requirement) {
    return `${requirement.criterion.criteriaArtifact.artifactId}:${requirement.criterion.criterionId}@${requirement.criterion.criterionVersion}`;
}
function assessCriterion(requirement, assessments) {
    const current = assessments.filter((assessment) => criterionAssessmentIsCurrent(assessment, requirement));
    for (const method of requirement.requiredMethods) {
        const methodAssessments = current.filter((assessment) => assessment.method === method);
        if (methodAssessments.length === 0) {
            return {
                kind: "criterion",
                id: criterionKey(requirement),
                reason: `missing current ${method} assessment`,
            };
        }
        if (methodAssessments.some((assessment) => assessment.verdict !== "SATISFIED")) {
            return {
                kind: "criterion",
                id: criterionKey(requirement),
                reason: `current ${method} assessment is not satisfied`,
            };
        }
    }
    return undefined;
}
export function evaluateWorkflowConvergence(policy, state) {
    const blockers = [];
    for (const requirement of policy.criteria) {
        const blocker = assessCriterion(requirement, state.assessments);
        if (blocker !== undefined)
            blockers.push(blocker);
    }
    for (const finding of state.findings) {
        if (!finding.resolved && finding.finding.severity === "blocking") {
            blockers.push({ kind: "finding", id: finding.finding.findingId, reason: "blocking Finding is unresolved" });
        }
    }
    for (const type of unique(policy.requiredDeliverableTypes)) {
        if (!state.deliverables.some((artifact) => artifact.current && artifact.type === type)) {
            blockers.push({ kind: "deliverable", id: type, reason: "required current deliverable is missing" });
        }
    }
    for (const id of unique(policy.requiredAuthorityGates)) {
        if (!state.authorityGates.some((gate) => gate.id === id && gate.resolved)) {
            blockers.push({ kind: "authority", id, reason: "required authority gate is unresolved" });
        }
    }
    const receipts = new Set(state.receiptIds);
    for (const id of unique(policy.requiredReceiptIds)) {
        if (!receipts.has(id))
            blockers.push({ kind: "receipt", id, reason: "required deterministic receipt is missing" });
    }
    for (const id of unique(policy.requiredDependencyIds)) {
        if (!state.dependencies.some((dependency) => dependency.id === id && dependency.resolved)) {
            blockers.push({ kind: "dependency", id, reason: "required dependency is unresolved" });
        }
    }
    const requiredPlanTasks = new Map((policy.requiredPlanTasks ?? []).map((task) => [planTaskKey(task), task]));
    for (const [id, requiredTask] of requiredPlanTasks) {
        if (!state.planTasks.some((task) => task.completed &&
            task.taskId === requiredTask.taskId &&
            task.planArtifact.runId === requiredTask.planArtifact.runId &&
            task.planArtifact.artifactId === requiredTask.planArtifact.artifactId))
            blockers.push({ kind: "plan_task", id, reason: "required PlanTask execution is incomplete" });
    }
    return { converged: blockers.length === 0, blockers };
}
//# sourceMappingURL=convergence.js.map