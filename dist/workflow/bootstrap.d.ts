import { type AccountId } from "#internet/core/accounts";
export interface WorkflowProfileAvailability {
    readonly software: boolean;
    readonly research: boolean;
}
export declare function resolveWorkflowProfileAvailability(accounts: ReadonlySet<AccountId>): WorkflowProfileAvailability;
//# sourceMappingURL=bootstrap.d.ts.map