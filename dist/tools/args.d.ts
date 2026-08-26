import type { WebProvider } from "#internet/core/config";
/** Validated `browser_chat` arguments. */
export interface ChatInput {
    provider: WebProvider;
    prompt: string;
}
/**
 * Validate and normalize the model-facing `browser_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export declare function parseChatArgs(args: Record<string, unknown>): ChatInput;
/** Validated `browser_team` arguments. */
export interface TeamInput {
    task: string;
    team?: string;
    rounds?: number;
    synthesize?: boolean;
    startProvider?: WebProvider;
}
/**
 * Validate and normalize the model-facing `browser_team` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export declare function parseTeamArgs(args: Record<string, unknown>): TeamInput;
//# sourceMappingURL=args.d.ts.map