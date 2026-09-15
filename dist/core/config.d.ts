import { type AccountId } from "#internet/core/accounts";
export type WebProvider = "chatgpt-web" | "gemini-web";
export declare const WEB_PROVIDERS: readonly WebProvider[];
export type ChatGptThinkingLevel = "instant" | "medium" | "high";
export declare const CHATGPT_THINKING_LEVELS: readonly ChatGptThinkingLevel[];
export interface BrowserConfig {
    chromePath?: string;
    dataDir: string;
    headless: boolean;
    loginTimeoutMs: number;
    remoteLoginPort: number;
    turnTimeoutMs: number;
    researchTimeoutMs: number;
    /** Workflow provider turn hard deadline. */
    workflowHardTimeoutMs: number;
    /** Maximum time a workflow provider may show no meaningful response progress. */
    workflowStallTimeoutMs: number;
    pollMs: number;
    stableMs: number;
    closeAfterMs: number;
    maxConcurrentTurnsPerAccount: number;
    maxOutputChars: number;
    teamRounds: number;
    teamMaxRounds: number;
    teamTranscriptMaxChars: number;
    teamSynthesis: boolean;
    teamSynthesizer: AccountId;
    enableChatgpt: boolean;
    enableGemini: boolean;
    chatgptThinkingLevel: ChatGptThinkingLevel;
}
export declare const DEFAULT_CONFIG: Required<Omit<BrowserConfig, "chromePath">>;
export declare const Config: import("@deepseek-ai/schemastery").Schema<{
    dataDir: string;
    headless: boolean;
    loginTimeoutMs: number;
    remoteLoginPort: number;
    turnTimeoutMs: number;
    researchTimeoutMs: number;
    workflowHardTimeoutMs: number;
    workflowStallTimeoutMs: number;
    pollMs: number;
    stableMs: number;
    closeAfterMs: number;
    maxConcurrentTurnsPerAccount: number;
    maxOutputChars: number;
    teamRounds: number;
    teamMaxRounds: number;
    teamTranscriptMaxChars: number;
    teamSynthesis: boolean;
    teamSynthesizer: string;
    enableChatgpt: boolean;
    enableGemini: boolean;
    chatgptThinkingLevel: string;
    chromePath: string;
}>;
export declare function resolveBrowserConfig(raw: unknown): BrowserConfig;
//# sourceMappingURL=config.d.ts.map