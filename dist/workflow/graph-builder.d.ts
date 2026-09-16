import type { AccountId } from "#internet/core/accounts";
import { type TeamPlan, type TeamPlanStep } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamTurn } from "#internet/team/types";
import { type WorkflowGraphNode, type WorkflowGraphSnapshot, type WorkflowLane, type WorkflowNodeInputReceipt } from "#internet/workflow/graph";
export interface WorkflowLaneInput {
    readonly task: string;
    readonly sessionId: string;
}
export interface InitialWorkflowGraphInput {
    readonly repository: string;
    readonly baseRevision: string;
    readonly rounds: number;
    readonly accounts: readonly AccountId[];
    readonly synthesizer: AccountId;
    readonly research: Readonly<Record<WorkflowLane, WorkflowLaneInput>>;
}
export interface ReviewCycleGraphInput {
    readonly cycle: number;
    readonly sourceNodeId: string;
    readonly rounds: number;
    readonly accounts: readonly AccountId[];
    readonly synthesizer: AccountId;
}
export interface TeamStepInputReceiptInput {
    readonly nodeId: string;
    readonly plan: TeamPlan;
    readonly step: TeamPlanStep;
    readonly task: string;
    readonly transcript: readonly TeamTurn[];
    readonly promptStrategy: TeamPromptStrategyId;
    readonly dependencyOutputHashes: Readonly<Record<string, string>>;
    readonly bindings: Readonly<Record<string, string | number | boolean>>;
}
export declare function hashWorkflowGraphValue(value: string): string;
export declare function createWorkflowNodeInputReceipt(nodeId: string, dependencyOutputHashes: Readonly<Record<string, string>>, bindings: Readonly<Record<string, string | number | boolean>>): WorkflowNodeInputReceipt;
export declare function createTeamStepInputReceipt(input: TeamStepInputReceiptInput): WorkflowNodeInputReceipt;
export declare function buildInitialWorkflowGraph(input: InitialWorkflowGraphInput): WorkflowGraphSnapshot;
export declare function buildReviewCycleNodes(input: ReviewCycleGraphInput): readonly WorkflowGraphNode[];
export declare function buildRemediationNode(cycle: number): WorkflowGraphNode;
//# sourceMappingURL=graph-builder.d.ts.map