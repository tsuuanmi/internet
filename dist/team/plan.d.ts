import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import { type TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamTurn } from "#internet/team/types";
export interface TeamPlanOptions {
    readonly accounts: readonly AccountId[];
    readonly rounds: number;
    readonly synthesize: boolean;
    readonly synthesizer: AccountId;
}
interface TeamStepDependency {
    readonly dependsOnStepIds: readonly string[];
}
export interface TeamMemberStep extends TeamStepDependency {
    readonly kind: "member";
    readonly stepId: string;
    readonly round: number;
    readonly member: number;
    readonly accountId: AccountId;
}
export interface TeamSynthesisStep extends TeamStepDependency {
    readonly kind: "synthesis";
    readonly stepId: "synthesis";
    readonly accountId: AccountId;
}
export type TeamPlanStep = TeamMemberStep | TeamSynthesisStep;
export interface TeamPlan {
    readonly accounts: readonly AccountId[];
    readonly rounds: number;
    readonly synthesize: boolean;
    readonly synthesizer: AccountId;
    readonly steps: readonly TeamPlanStep[];
}
export interface PreparedTeamStep {
    readonly step: TeamPlanStep;
    readonly accountId: AccountId;
    readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly prompt: string;
}
export declare function buildTeamPlan(options: TeamPlanOptions): TeamPlan;
export declare function prepareTeamStep(plan: TeamPlan, step: TeamPlanStep, task: string, transcript: readonly TeamTurn[], promptStrategy: TeamPromptStrategyId): PreparedTeamStep;
export {};
//# sourceMappingURL=plan.d.ts.map