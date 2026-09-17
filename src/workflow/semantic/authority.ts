import { canonicalJson } from "#internet/core/canonical-json";
import type {
	WorkflowAcceptanceCriterion,
	WorkflowCriterionRevisionAuthority,
} from "#internet/workflow/semantic/types";

export class WorkflowCriterionAuthorityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowCriterionAuthorityError";
	}
}

export function requiredCriterionRevisionAuthority(
	criterion: WorkflowAcceptanceCriterion,
): WorkflowCriterionRevisionAuthority {
	switch (criterion.provenance) {
		case "user":
			return "user";
		case "policy":
			return "policy";
		case "planner_derived":
			return "planner";
	}
}

function criterionDefinition(criterion: WorkflowAcceptanceCriterion): unknown {
	return {
		criterionId: criterion.criterionId,
		version: criterion.version,
		statement: criterion.statement,
		provenance: criterion.provenance,
		required: criterion.required,
		assessmentPolicy: criterion.assessmentPolicy,
	};
}

export function criterionChanged(
	current: WorkflowAcceptanceCriterion,
	next: WorkflowAcceptanceCriterion | undefined,
): boolean {
	if (next === undefined) return true;
	return canonicalJson(criterionDefinition(current)) !== canonicalJson(criterionDefinition(next));
}

export function assertCriterionRevisionAuthority(
	current: WorkflowAcceptanceCriterion,
	next: WorkflowAcceptanceCriterion | undefined,
	authority: WorkflowCriterionRevisionAuthority | undefined,
): void {
	if (!criterionChanged(current, next)) return;
	const required = requiredCriterionRevisionAuthority(current);
	if (authority !== required) {
		throw new WorkflowCriterionAuthorityError(
			`criterion ${current.criterionId} requires ${required} authority for revision`,
		);
	}
}
