import { canonicalJson } from "#internet/core/canonical-json";
export class WorkflowCriterionAuthorityError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowCriterionAuthorityError";
    }
}
export function requiredCriterionRevisionAuthority(criterion) {
    switch (criterion.provenance) {
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
export function criterionChanged(current, next) {
    if (next === undefined)
        return true;
    return canonicalJson(criterionDefinition(current)) !== canonicalJson(criterionDefinition(next));
}
export function assertCriterionRevisionAuthority(current, next, authority) {
    if (!criterionChanged(current, next))
        return;
    const required = requiredCriterionRevisionAuthority(current);
    if (authority !== required) {
        throw new WorkflowCriterionAuthorityError(`criterion ${current.criterionId} requires ${required} authority for revision`);
    }
}
//# sourceMappingURL=authority.js.map