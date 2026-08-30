import type { WebProvider } from "#internet/core/config";
/** Validated `internet_chat` arguments. */
export interface ChatInput {
    provider: WebProvider;
    prompt: string;
    visible?: boolean;
}
/**
 * Validate and normalize the model-facing `internet_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export declare function parseChatArgs(args: Record<string, unknown>): ChatInput;
/** Validated `internet_research` arguments. */
export interface ResearchInput {
    query: string;
    name?: string;
    providers?: WebProvider[];
    visible?: boolean;
}
/** Validate research arguments without coupling the parser to DSH packages. */
export declare function parseResearchArgs(args: Record<string, unknown>): ResearchInput;
/** Validated `internet_team` arguments. */
export interface TeamInput {
    task: string;
    team?: string;
    rounds?: number;
    synthesize?: boolean;
    includeTranscript?: boolean;
    providers?: WebProvider[];
    visible?: boolean;
}
/**
 * Validate and normalize the model-facing `internet_team` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export declare function parseTeamArgs(args: Record<string, unknown>): TeamInput;
//# sourceMappingURL=args.d.ts.map