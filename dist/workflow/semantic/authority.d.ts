import type { WorkflowAcceptanceCriterion, WorkflowCriterionRevisionAuthority } from "#internet/workflow/semantic/types";
export declare class WorkflowCriterionAuthorityError extends Error {
    constructor(message: string);
}
export declare function requiredCriterionRevisionAuthority(criterion: WorkflowAcceptanceCriterion): WorkflowCriterionRevisionAuthority;
export declare function criterionChanged(current: WorkflowAcceptanceCriterion, next: WorkflowAcceptanceCriterion | undefined): boolean;
export declare function assertCriterionRevisionAuthority(current: WorkflowAcceptanceCriterion, next: WorkflowAcceptanceCriterion | undefined, authority: WorkflowCriterionRevisionAuthority | undefined): void;
//# sourceMappingURL=authority.d.ts.map