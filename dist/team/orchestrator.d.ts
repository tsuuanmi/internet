import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
/** One completed contribution in a team debate. */
export interface TeamTurn {
    round: number;
    provider: WebProvider;
    text: string;
}
/** Result of a team debate: the final answer, or a partial failure. */
export interface TeamResult {
    finalAnswer?: string;
    finalProvider?: WebProvider;
    error?: {
        provider: WebProvider;
        message: string;
    };
}
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
    /** Which provider opens the debate. */
    startProvider?: WebProvider;
    signal?: AbortSignal;
}
/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (provider: WebProvider, request: ChatRequest) => Promise<ChatResult>;
/**
 * Compose the prompt for one debate turn. The opener (round 1, no prior
 * contribution from the other model) asks for an initial analysis; later turns
 * feed the other model's latest message and ask for critique and refinement.
 * Each model's own history already lives in its native conversation, so only
 * the other model's latest message needs to be injected.
 */
export declare function composeTurnPrompt(task: string, provider: WebProvider, otherProvider: WebProvider, otherLatestText: string, round: number): string;
/** Compose the final synthesis prompt from the full debate transcript. */
export declare function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string;
/**
 * Run a two-model debate: the providers alternate for `rounds` rounds, each
 * seeing the other's latest message, then (optionally) the last speaker
 * synthesizes a single final answer from the full transcript. The team uses a
 * derived session key so its conversations are isolated from the agent's own
 * direct `browser_chat` threads yet durable across repeated team calls.
 */
export declare function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult>;
//# sourceMappingURL=orchestrator.d.ts.map