import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import { type TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { OtherContribution, TeamFailureDetail, TeamProgressEvent, TeamTurn } from "#internet/team/types";
export type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
export type { OtherContribution, TeamFailureDetail, TeamProgressEvent, TeamStage, TeamTurn, } from "#internet/team/types";
/** Successful result of a team debate. */
export interface TeamSuccess {
    readonly finalAnswer: string;
    readonly finalAccountId: AccountId;
    readonly finalProvider: ReturnType<typeof getAccountDefinition>["provider"];
    /** Completed debate turns for this invocation; synthesis is not included. */
    readonly transcript: readonly TeamTurn[];
}
/** Failed result of a team debate, retaining completed turns for audit/diagnostics. */
export interface TeamFailure {
    readonly error: TeamFailureDetail;
    readonly transcript: readonly TeamTurn[];
}
export type TeamResult = TeamSuccess | TeamFailure;
export type TeamProgressObserver = (event: TeamProgressEvent) => void;
/** Options for {@link runTeam}. */
export interface TeamOptions {
    readonly task: string;
    /** Exact durable conversation owner key used for every account in this team lane. */
    readonly sessionId: string;
    /** Number of debate rounds (each account speaks once per round). */
    readonly rounds?: number;
    /** Whether to append a final synthesis turn. */
    readonly synthesize?: boolean;
    /** Account that performs the final synthesis, independent of speaking order. */
    readonly synthesizer?: AccountId;
    /** Ordered reasoning accounts; the first opens the debate. */
    readonly accounts?: readonly AccountId[];
    /** Prompt composition purpose. The execution engine remains shared. */
    readonly promptStrategy?: TeamPromptStrategyId;
    /** Show automated account browsers on the user-managed display. */
    readonly visible?: boolean;
    readonly signal?: AbortSignal;
    /** Best-effort structured lifecycle observer; observer failure never changes team correctness. */
    readonly onProgress?: TeamProgressObserver;
}
/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;
/** Join display names with an Oxford comma. Retained as a small public utility. */
export declare function joinNames(names: readonly string[]): string;
/** Compose the default generic prompt for one debate turn. */
export declare function composeTurnPrompt(task: string, accountId: AccountId, others: readonly OtherContribution[], round: number): string;
/** Compose the default generic final synthesis prompt. */
export declare function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string;
/**
 * Run a multi-model debate using an exact durable conversation-session key.
 * Callers own namespace construction; this primitive owns the single authoritative
 * round/synthesis loop and emits structured progress for optional durable observers.
 */
export declare function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult>;
//# sourceMappingURL=orchestrator.d.ts.map