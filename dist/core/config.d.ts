/** Browser-backed web providers this plugin can drive. */
export type WebProvider = "chatgpt-web" | "gemini-web";
/** Known provider ids, used to validate tool arguments. */
export declare const WEB_PROVIDERS: readonly WebProvider[];
/** Per-plugin resolved configuration. */
export interface BrowserConfig {
    /** Explicit Chrome binary path; otherwise the system Chrome is discovered. */
    chromePath?: string;
    /** Root directory that owns per-account Chrome profiles and storage state. */
    dataDir: string;
    /** Whether inference runs Chrome headless (login always runs headed). */
    headless: boolean;
    /** Max time to wait for an interactive login to reach the authenticated surface (ms). */
    loginTimeoutMs: number;
    /** Max time for one browser chat turn to reach completion (ms). */
    turnTimeoutMs: number;
    /** Completion-poll interval (ms). */
    pollMs: number;
    /** How long the rendered response must stay unchanged before it is "done" (ms). */
    stableMs: number;
    /** Delay before the idle inference browser is closed after a turn (ms). */
    closeAfterMs: number;
    /** Upper bound on returned chat output characters. */
    maxOutputChars: number;
    /** Number of debate rounds for the `browser_team` tool (each model speaks once per round). */
    teamRounds: number;
    /** Whether the `browser_team` tool appends a final synthesis turn. */
    teamSynthesis: boolean;
    /** Register the ChatGPT Web provider. */
    enableChatgpt: boolean;
    /** Register the Gemini Web provider. */
    enableGemini: boolean;
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
    turnTimeoutMs: number;
    pollMs: number;
    stableMs: number;
    closeAfterMs: number;
    maxOutputChars: number;
    teamRounds: number;
    teamSynthesis: boolean;
    enableChatgpt: boolean;
    enableGemini: boolean;
    chromePath: string;
}>;
/**
 * Resolve raw plugin config (from the DSH profile) into a validated
 * {@link BrowserConfig}. Unknown fields are ignored; missing fields fall back
 * to defaults. Invalid explicit values fail loudly rather than silently.
 */
export declare function resolveBrowserConfig(raw: unknown): BrowserConfig;
//# sourceMappingURL=config.d.ts.map