import type { AccountId } from "#internet/core/accounts";
import type { OtherContribution, TeamTurn } from "#internet/team/types";
export declare const TEAM_PROMPT_STRATEGIES: readonly ["generic-debate", "workflow-research", "workflow-review"];
export type TeamPromptStrategyId = (typeof TEAM_PROMPT_STRATEGIES)[number];
interface TurnPromptInput {
    readonly task: string;
    readonly accountId: AccountId;
    readonly others: readonly OtherContribution[];
    readonly round: number;
}
interface SynthesisPromptInput {
    readonly task: string;
    readonly transcript: readonly TeamTurn[];
}
export interface TeamPromptStrategy {
    turn(input: TurnPromptInput): string;
    synthesis(input: SynthesisPromptInput): string;
}
export declare function getTeamPromptStrategy(id: TeamPromptStrategyId): TeamPromptStrategy;
export {};
//# sourceMappingURL=prompt-strategy.d.ts.map