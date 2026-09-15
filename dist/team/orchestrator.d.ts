import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import { type TeamProgressObserver as StepProgressObserver, type TeamChatFn } from "#internet/team/executor";
import { type TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { OtherContribution, TeamFailureDetail, TeamTurn } from "#internet/team/types";
export type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
export type { OtherContribution, TeamFailureDetail, TeamProgressEvent, TeamStage, TeamTurn, } from "#internet/team/types";
export interface TeamSuccess {
    readonly finalAnswer: string;
    readonly finalAccountId: AccountId;
    readonly finalProvider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly transcript: readonly TeamTurn[];
}
export interface TeamFailure {
    readonly error: TeamFailureDetail;
    readonly transcript: readonly TeamTurn[];
}
export type TeamResult = TeamSuccess | TeamFailure;
export type TeamProgressObserver = StepProgressObserver;
export type ChatFn = TeamChatFn;
export interface TeamOptions {
    readonly task: string;
    readonly sessionId: string;
    readonly rounds?: number;
    readonly synthesize?: boolean;
    readonly synthesizer?: AccountId;
    readonly accounts?: readonly AccountId[];
    readonly promptStrategy?: TeamPromptStrategyId;
    readonly visible?: boolean;
    readonly signal?: AbortSignal;
    readonly onProgress?: TeamProgressObserver;
}
export declare function joinNames(names: readonly string[]): string;
export declare function composeTurnPrompt(task: string, accountId: AccountId, others: readonly OtherContribution[], round: number, members?: readonly AccountId[]): string;
export declare function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[], members?: readonly AccountId[]): string;
/** Execute the shared deterministic team plan in memory. Durable workflow execution uses the same runTeamStep primitive. */
export declare function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult>;
//# sourceMappingURL=orchestrator.d.ts.map