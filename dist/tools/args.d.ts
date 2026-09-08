import { type AccountId } from "#internet/core/accounts";
/** Validated `internet_chat` arguments. */
export interface ChatInput {
    accountId: AccountId;
    prompt: string;
    visible?: boolean;
}
/** Validate and normalize model-facing `internet_chat` arguments. */
export declare function parseChatArgs(args: Record<string, unknown>): ChatInput;
/** Validated `internet_research` arguments. */
export interface ResearchInput {
    query: string;
    name?: string;
    accounts?: AccountId[];
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
    accounts?: AccountId[];
    visible?: boolean;
}
/** Validate and normalize the model-facing `internet_team` arguments. */
export declare function parseTeamArgs(args: Record<string, unknown>): TeamInput;
//# sourceMappingURL=args.d.ts.map