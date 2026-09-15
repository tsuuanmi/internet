import type { TeamFailureDetail } from "#internet/team/types";
import type { WorkflowExecutionRecord, WorkflowFailure, WorkflowRecoveryPlan } from "#internet/workflow/graph";
export interface WorkflowRecoveryPolicy {
    readonly maxAttempts: number;
    readonly backoffMs: number;
}
export declare const DEFAULT_WORKFLOW_RECOVERY_POLICY: WorkflowRecoveryPolicy;
export declare function executionLeaseExpired(execution: WorkflowExecutionRecord, at?: number): boolean;
export declare function providerProgressStalled(execution: WorkflowExecutionRecord, stallTimeoutMs: number, at?: number): boolean;
export declare function classifyTeamFailure(detail: TeamFailureDetail): WorkflowFailure;
export declare function classifyWorkflowFailure(error: unknown, at?: string): WorkflowFailure;
export declare function recoveryPlanForFailure(failure: WorkflowFailure, currentAttempt: number, policy?: WorkflowRecoveryPolicy, at?: number): WorkflowRecoveryPlan | undefined;
//# sourceMappingURL=recovery.d.ts.map