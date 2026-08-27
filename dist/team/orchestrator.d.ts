import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
/** One completed contribution in a team debate. */
export interface TeamTurn {
    round: number;
    provider: WebProvider;
    text: string;
}
/** A teammate's latest message, shown to the current speaker. */
export interface OtherContribution {
    provider: WebProvider;
    text: string;
}
/** Successful result of a team debate. */
export interface TeamSuccess {
    finalAnswer: string;
    finalProvider: WebProvider;
    /** Completed debate turns for this invocation; synthesis is not included. */
    transcript: readonly TeamTurn[];
}
/** Failed result of a team debate, retaining completed turns for optional audit output. */
export interface TeamFailure {
    error: {
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
    /** Durable owner key: the current DSH agent/session ID. */
    sessionId: string;
    /** Optional team namespace; teams with different names get separate threads. */
    teamName?: string;
    /** Number of debate rounds (each model speaks once per round). */
    rounds?: number;
    /** Whether to append a final synthesis turn. */
    synthesize?: boolean;
    /** Ordered providers; the first opens the debate. */
    providers?: readonly WebProvider[];
    /** Show automated provider browsers on the user-managed display. */
    visible?: boolean;
    signal?: AbortSignal;
}
/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (provider: WebProvider, request: ChatRequest) => Promise<ChatResult>;
/** Join display names with an Oxford comma: "A", "A and B", "A, B, and C". */
export declare function joinNames(names: readonly string[]): string;
/**
 * Compose the prompt for one debate turn. The opener (round 1, before any
 * teammate has spoken) asks for an initial analysis; later turns feed every
 * other model's latest message and ask for critique and refinement. Each
 * model's own history already lives in its native conversation, so only the
 * other models' latest messages need to be injected.
 */
export declare function composeTurnPrompt(task: string, provider: WebProvider, others: readonly OtherContribution[], round: number): string;
/** Compose the final synthesis prompt from the full debate transcript. */
export declare function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string;
/**
 * Run a multi-model debate: the providers speak in order each round, each
 * seeing every other model's latest message, then (optionally) the last
 * speaker synthesizes a single final answer from the full transcript. The team
 * uses a derived session key so its conversations are isolated from the
 * agent's own direct `browser_chat` threads yet durable across repeated calls.
 */
export declare function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult>;
//# sourceMappingURL=orchestrator.d.ts.map