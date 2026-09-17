import type { WorkflowAcceptanceCriteriaPayload, WorkflowObjectivePayload, WorkflowRequirementRevisionAuthority } from "#internet/workflow/semantic/types";
export declare class WorkflowRequirementAuthorityError extends Error {
    constructor(message: string);
}
export declare function assertObjectiveRevisionAuthority(current: WorkflowObjectivePayload, next: WorkflowObjectivePayload, authorities: readonly WorkflowRequirementRevisionAuthority[]): void;
export declare function assertAcceptanceCriteriaRevisionAuthority(current: WorkflowAcceptanceCriteriaPayload, next: WorkflowAcceptanceCriteriaPayload, authorities: readonly WorkflowRequirementRevisionAuthority[]): void;
//# sourceMappingURL=authority.d.ts.map