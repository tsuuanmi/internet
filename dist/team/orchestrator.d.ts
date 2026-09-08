import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
/** One completed contribution in a team debate. */
export interface TeamTurn {
    round: number;
    accountId: AccountId;
    provider: WebProvider;
    text: string;
}
/** A teammate's latest message, shown to the current speaker. */
export interface OtherContribution {
    accountId: AccountId;
    provider: WebProvider;
    text: string;
}
/** Successful result of a team debate. */
export interface TeamSuccess {
    finalAnswer: string;
    finalAccountId: AccountId;
    finalProvider: WebProvider;
    /** Completed debate turns for this invocation; synthesis is not included. */
    transcript: readonly TeamTurn[];
}
/** Failed result of a team debate, retaining completed turns for optional audit output. */
export interface TeamFailure {
    error: {
        accountId: AccountId;
        provider: WebProvider;
        message: string;
    };
    transcript: readonly TeamTurn[];
}
/** Result of a team debate: a final answer or a failure with completed turns. */
export type TeamResult = TeamSuccess | TeamFailure;
/** Options for {@link runTeam}. */
export interface TeamOptions {
    task: string;
    /** Exact durable conversation owner key used for every account in this team lane. */
    sessionId: string;
    /** Number of debate rounds (each account speaks once per round). */
    rounds?: number;
    /** Whether to append a final synthesis turn. */
    synthesize?: boolean;
    /** Account that performs the final synthesis, independent of speaking order. */
    synthesizer?: AccountId;
    /** Ordered reasoning accounts; the first opens the debate. */
    accounts?: readonly AccountId[];
    /** Show automated account browsers on the user-managed display. */
    visible?: boolean;
    signal?: AbortSignal;
}
/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;
/** Join display names with an Oxford comma: "A", "A and B", "A, B, and C". */
export declare function joinNames(names: readonly string[]): string;
/** Compose the prompt for one debate turn. */
export declare function composeTurnPrompt(task: string, accountId: AccountId, others: readonly OtherContribution[], round: number): string;
/** Compose the final synthesis prompt from the full debate transcript. */
export declare function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string;
/**
 * Run a multi-model debate using an exact durable conversation-session key.
 * Callers own namespace construction; this primitive does not append hidden
 * provider/tool-specific suffixes.
 */
export declare function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult>;
//# sourceMappingURL=orchestrator.d.ts.map