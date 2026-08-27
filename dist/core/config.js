import { homedir } from "node:os";
import { join } from "node:path";
import S from "@deepseek-ai/schemastery";
import { InternetError } from "#internet/core/errors";
/** Known provider ids, used to validate tool arguments. */
export const WEB_PROVIDERS = ["chatgpt-web", "gemini-web"];
/** Known ChatGPT thinking levels, used to validate config and tool arguments. */
export const CHATGPT_THINKING_LEVELS = [
    "instant",
    "medium",
    "high",
    "extra-high",
    "pro",
];
/** Resolve the DeepSeek Harness home (mirrors `resolveDshHome`: `$DSH_HOME` or `~/.dsh`). */
function dshHome() {
    return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
export const DEFAULT_CONFIG = {
    dataDir: join(dshHome(), "internet"),
    headless: false,
    loginTimeoutMs: 180_000,
    turnTimeoutMs: 180_000,
    pollMs: 200,
    stableMs: 1_500,
    closeAfterMs: 1_800_000,
    maxOutputChars: 200_000,
    teamRounds: 2,
    teamMaxRounds: 4,
    teamTranscriptMaxChars: 50_000,
    teamSynthesis: true,
    enableChatgpt: true,
    enableGemini: true,
    chatgptThinkingLevel: "medium",
};
/**
 * Plugin `Config` export: a Schemastery object schema. DSH validates the
 * profile config through it (`Config["~standard"].validate`) before calling
 * `apply`, and uses it to render the settings UI.
 */
export const Config = S.object({
    dataDir: S.string().default(DEFAULT_CONFIG.dataDir),
    headless: S.boolean().default(DEFAULT_CONFIG.headless),
    loginTimeoutMs: S.number().default(DEFAULT_CONFIG.loginTimeoutMs),
    turnTimeoutMs: S.number().default(DEFAULT_CONFIG.turnTimeoutMs),
    pollMs: S.number().default(DEFAULT_CONFIG.pollMs),
    stableMs: S.number().default(DEFAULT_CONFIG.stableMs),
    closeAfterMs: S.number().default(DEFAULT_CONFIG.closeAfterMs),
    maxOutputChars: S.number().default(DEFAULT_CONFIG.maxOutputChars),
    teamRounds: S.number().default(DEFAULT_CONFIG.teamRounds),
    teamMaxRounds: S.number().default(DEFAULT_CONFIG.teamMaxRounds),
    teamTranscriptMaxChars: S.number().default(DEFAULT_CONFIG.teamTranscriptMaxChars),
    teamSynthesis: S.boolean().default(DEFAULT_CONFIG.teamSynthesis),
    enableChatgpt: S.boolean().default(DEFAULT_CONFIG.enableChatgpt),
    enableGemini: S.boolean().default(DEFAULT_CONFIG.enableGemini),
    chatgptThinkingLevel: S.string().default(DEFAULT_CONFIG.chatgptThinkingLevel),
    chromePath: S.string(),
});
function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
/** Expand a leading `~` to the user's home directory (keeps absolute paths intact). */
function expandHome(path) {
    if (path === "~")
        return homedir();
    if (path.startsWith("~/"))
        return join(homedir(), path.slice(2));
    return path;
}
function asPositiveInteger(value, fallback, name) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 1)) {
        throw new InternetError("config_error", `browser config ${name} must be at least 1`);
    }
    return typeof value === "number" ? Math.floor(value) : fallback;
}
function asChatGptThinkingLevel(value) {
    if (value === undefined)
        return DEFAULT_CONFIG.chatgptThinkingLevel;
    if (typeof value === "string" && CHATGPT_THINKING_LEVELS.includes(value)) {
        return value;
    }
    throw new InternetError("config_error", `browser config chatgptThinkingLevel must be one of ${CHATGPT_THINKING_LEVELS.join(", ")}`);
}
/**
 * Resolve raw plugin config (from the DSH profile) into a validated
 * {@link BrowserConfig}. Unknown fields are ignored; missing fields fall back
 * to defaults. Invalid explicit values fail loudly rather than silently.
 */
export function resolveBrowserConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const teamRounds = asPositiveInteger(input.teamRounds, DEFAULT_CONFIG.teamRounds, "teamRounds");
    const teamMaxRounds = asPositiveInteger(input.teamMaxRounds, DEFAULT_CONFIG.teamMaxRounds, "teamMaxRounds");
    if (teamRounds > teamMaxRounds) {
        throw new InternetError("config_error", "browser config teamRounds must not exceed teamMaxRounds");
    }
    return {
        chromePath: typeof input.chromePath === "string" && input.chromePath.length > 0 ? expandHome(input.chromePath) : undefined,
        dataDir: typeof input.dataDir === "string" && input.dataDir.length > 0
            ? expandHome(input.dataDir)
            : DEFAULT_CONFIG.dataDir,
        headless: asBoolean(input.headless, DEFAULT_CONFIG.headless),
        loginTimeoutMs: asPositiveInteger(input.loginTimeoutMs, DEFAULT_CONFIG.loginTimeoutMs, "loginTimeoutMs"),
        turnTimeoutMs: asPositiveInteger(input.turnTimeoutMs, DEFAULT_CONFIG.turnTimeoutMs, "turnTimeoutMs"),
        pollMs: asPositiveInteger(input.pollMs, DEFAULT_CONFIG.pollMs, "pollMs"),
        stableMs: asPositiveInteger(input.stableMs, DEFAULT_CONFIG.stableMs, "stableMs"),
        closeAfterMs: asPositiveInteger(input.closeAfterMs, DEFAULT_CONFIG.closeAfterMs, "closeAfterMs"),
        maxOutputChars: asPositiveInteger(input.maxOutputChars, DEFAULT_CONFIG.maxOutputChars, "maxOutputChars"),
        teamRounds,
        teamMaxRounds,
        teamTranscriptMaxChars: asPositiveInteger(input.teamTranscriptMaxChars, DEFAULT_CONFIG.teamTranscriptMaxChars, "teamTranscriptMaxChars"),
        teamSynthesis: asBoolean(input.teamSynthesis, DEFAULT_CONFIG.teamSynthesis),
        enableChatgpt: asBoolean(input.enableChatgpt, DEFAULT_CONFIG.enableChatgpt),
        enableGemini: asBoolean(input.enableGemini, DEFAULT_CONFIG.enableGemini),
        chatgptThinkingLevel: asChatGptThinkingLevel(input.chatgptThinkingLevel),
    };
}
//# sourceMappingURL=config.js.map