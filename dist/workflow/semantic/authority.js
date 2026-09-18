import { canonicalJson } from "#internet/core/canonical-json";
export class WorkflowRequirementAuthorityError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowRequirementAuthorityError";
    }
}
function requiredAuthority(provenance) {
    switch (provenance) {
        case "user":
            return "user";
        case "policy":
            return "policy";
        case "planner_derived":
            return "planner";
    }
}
function criterionDefinition(criterion) {
    return {
        criterionId: criterion.criterionId,
        version: criterion.version,
        statement: criterion.statement,
        provenance: criterion.provenance,
        required: criterion.required,
        assessmentPolicy: criterion.assessmentPolicy,
    };
}
function constraintDefinition(constraint) {
    return {
        id: constraint.id,
        statement: constraint.statement,
        provenance: constraint.provenance,
    };
}
function assertAuthority(label, provenance, authorities) {
    const required = requiredAuthority(provenance);
    if (!authorities.has(required)) {
        throw new WorkflowRequirementAuthorityError(`${label} requires ${required} authority for revision`);
    }
}
function changed(current, next, definition) {
    return next === undefined || canonicalJson(definition(current)) !== canonicalJson(definition(next));
}
export function assertObjectiveRevisionAuthority(current, next, authorities) {
    const granted = new Set(authorities);
    const currentConstraints = new Map(current.constraints.map((constraint) => [constraint.id, constraint]));
    const nextConstraints = new Map(next.constraints.map((constraint) => [constraint.id, constraint]));
    for (const constraint of current.constraints) {
        const nextConstraint = nextConstraints.get(constraint.id);
        if (changed(constraint, nextConstraint, constraintDefinition)) {
            assertAuthority(`objective constraint ${constraint.id}`, constraint.provenance, granted);
        }
    }
    for (const constraint of next.constraints) {
        if (!currentConstraints.has(constraint.id)) {
            assertAuthority(`objective constraint ${constraint.id}`, constraint.provenance, granted);
        }
    }
    if (current.statement !== next.statement && !granted.has("planner")) {
        throw new WorkflowRequirementAuthorityError("objective statement revision requires planner authority");
    }
}
export function assertAcceptanceCriteriaRevisionAuthority(current, next, authorities) {
    const granted = new Set(authorities);
    const currentCriteria = new Map(current.criteria.map((criterion) => [criterion.criterionId, criterion]));
    const nextCriteria = new Map(next.criteria.map((criterion) => [criterion.criterionId, criterion]));
    for (const criterion of current.criteria) {
        const nextCriterion = nextCriteria.get(criterion.criterionId);
        if (changed(criterion, nextCriterion, criterionDefinition)) {
            assertAuthority(`criterion ${criterion.criterionId}`, criterion.provenance, granted);
        }
    }
    for (const criterion of next.criteria) {
        if (!currentCriteria.has(criterion.criterionId)) {
            assertAuthority(`criterion ${criterion.criterionId}`, criterion.provenance, granted);
        }
    }
}
//# sourceMappingURL=authority.js.map