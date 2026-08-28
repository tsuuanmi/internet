/** Browser-backed web providers this plugin can drive. */
export type WebProvider = "chatgpt-web" | "gemini-web";
/** Known provider ids, used to validate tool arguments. */
export declare const WEB_PROVIDERS: readonly WebProvider[];
/**
 * ChatGPT Web reasoning-effort levels, ordered by the UI index the model
 * switcher exposes (Instant=0, Medium=1, High=2). "Medium" is the default
 * unless the profile explicitly overrides it.
 */
export type ChatGptThinkingLevel = "instant" | "medium" | "high";
/** Known ChatGPT thinking levels, used to validate plugin configuration. */
export declare const CHATGPT_THINKING_LEVELS: readonly ChatGptThinkingLevel[];
/** Per-plugin resolved configuration. */
export interface BrowserConfig {
    /** Explicit Chrome binary path; otherwise the system Chrome is discovered. */
    chromePath?: string;
    /** DSH data directory containing portable accounts, local profiles, and conversations. */
    dataDir: string;
    /** Native headless when true; otherwise headed (managed Xvfb first on Linux). */
    headless: boolean;
    /** Max time to wait for an interactive login to reach the authenticated surface (ms). */
    loginTimeoutMs: number;
    /** Stable loopback port for ChatGPT remote login; Gemini uses the next port. */
    remoteLoginPort: number;
    /** Max time for one browser chat turn to reach completion (ms). */
    turnTimeoutMs: number;
    /** Completion-poll interval (ms). */
    pollMs: number;
    /** How long the rendered response must stay unchanged before it is "done" (ms). */
    stableMs: number;
    /** Idle delay before an inference browser is closed after a turn (ms). */
    closeAfterMs: number;
    /** Upper bound on returned chat output characters. */
    maxOutputChars: number;
    /** Default debate rounds for the `browser_team` tool (each model speaks once per round). */
    teamRounds: number;
    /** Maximum per-call debate rounds accepted by `browser_team`. */
    teamMaxRounds: number;
    /** Maximum aggregate Unicode code points returned by an opt-in team transcript. */
    teamTranscriptMaxChars: number;
    /** Whether the `browser_team` tool appends a final synthesis turn. */
    teamSynthesis: boolean;
    /** Register the ChatGPT Web provider. */
    enableChatgpt: boolean;
    /** Register the Gemini Web provider. */
    enableGemini: boolean;
    /** Default ChatGPT Web reasoning-effort level selected before each turn. */
    chatgptThinkingLevel: ChatGptThinkingLevel;
}
export declare const DEFAULT_CONFIG: Required<Omit<BrowserConfig, "chromePath">>;
/**
 * Plugin `Config` export: a Schemastery object schema. DSH validates the
 * profile config through it (`Config["~standard"].validate`) before calling
 * `apply`, and uses it to render the settings UI.
 */
export declare const Config: import("@deepseek-ai/schemastery").Schema<{
    dataDir: string;
    headless: boolean;
    loginTimeoutMs: number;
    remoteLoginPort: number;
    turnTimeoutMs: number;
    pollMs: number;
    stableMs: number;
    closeAfterMs: number;
    maxOutputChars: number;
    teamRounds: number;
    teamMaxRounds: number;
    teamTranscriptMaxChars: number;
    teamSynthesis: boolean;
    enableChatgpt: boolean;
    enableGemini: boolean;
    chatgptThinkingLevel: string;
    chromePath: string;
}>;
/**
 * Resolve raw plugin config (from the DSH profile) into a validated
 * {@link BrowserConfig}. Unknown fields are ignored; missing fields fall back
 * to defaults. Invalid explicit values fail loudly rather than silently.
 */
export declare function resolveBrowserConfig(raw: unknown): BrowserConfig;
//# sourceMappingURL=config.d.ts.map