import { homedir } from "node:os";
import { join, resolve } from "node:path";
import S from "@deepseek-ai/schemastery";
import { ACCOUNT_IDS, accountHasCapability, DEFAULT_TEAM_SYNTHESIZER } from "#internet/core/accounts";
import { InternetError } from "#internet/core/errors";
export const WEB_PROVIDERS = ["chatgpt-web", "gemini-web"];
export const CHATGPT_THINKING_LEVELS = ["instant", "medium", "high"];
function dshHome() {
    return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
export const DEFAULT_CONFIG = {
    dataDir: join(dshHome(), "internet"),
    headless: false,
    loginTimeoutMs: 1_800_000,
    remoteLoginPort: 39_000,
    turnTimeoutMs: 300_000,
    researchTimeoutMs: 1_800_000,
    workflowHardTimeoutMs: 900_000,
    workflowStallTimeoutMs: 180_000,
    pollMs: 200,
    stableMs: 1_500,
    closeAfterMs: 1_800_000,
    maxConcurrentTurnsPerAccount: 2,
    maxOutputChars: 200_000,
    teamRounds: 2,
    teamMaxRounds: 4,
    teamTranscriptMaxChars: 50_000,
    teamSynthesis: true,
    teamSynthesizer: DEFAULT_TEAM_SYNTHESIZER,
    enableChatgpt: true,
    enableGemini: true,
    chatgptThinkingLevel: "high",
};
export const Config = S.object({
    dataDir: S.string().default(DEFAULT_CONFIG.dataDir),
    headless: S.boolean().default(DEFAULT_CONFIG.headless),
    loginTimeoutMs: S.number().default(DEFAULT_CONFIG.loginTimeoutMs),
    remoteLoginPort: S.number().default(DEFAULT_CONFIG.remoteLoginPort),
    turnTimeoutMs: S.number().default(DEFAULT_CONFIG.turnTimeoutMs),
    researchTimeoutMs: S.number().default(DEFAULT_CONFIG.researchTimeoutMs),
    workflowHardTimeoutMs: S.number().default(DEFAULT_CONFIG.workflowHardTimeoutMs),
    workflowStallTimeoutMs: S.number().default(DEFAULT_CONFIG.workflowStallTimeoutMs),
    pollMs: S.number().default(DEFAULT_CONFIG.pollMs),
    stableMs: S.number().default(DEFAULT_CONFIG.stableMs),
    closeAfterMs: S.number().default(DEFAULT_CONFIG.closeAfterMs),
    maxConcurrentTurnsPerAccount: S.number().default(DEFAULT_CONFIG.maxConcurrentTurnsPerAccount),
    maxOutputChars: S.number().default(DEFAULT_CONFIG.maxOutputChars),
    teamRounds: S.number().default(DEFAULT_CONFIG.teamRounds),
    teamMaxRounds: S.number().default(DEFAULT_CONFIG.teamMaxRounds),
    teamTranscriptMaxChars: S.number().default(DEFAULT_CONFIG.teamTranscriptMaxChars),
    teamSynthesis: S.boolean().default(DEFAULT_CONFIG.teamSynthesis),
    teamSynthesizer: S.string().default(DEFAULT_CONFIG.teamSynthesizer),
    enableChatgpt: S.boolean().default(DEFAULT_CONFIG.enableChatgpt),
    enableGemini: S.boolean().default(DEFAULT_CONFIG.enableGemini),
    chatgptThinkingLevel: S.string().default(DEFAULT_CONFIG.chatgptThinkingLevel),
    chromePath: S.string(),
});
function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
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
function asTeamSynthesizer(value) {
    const selected = value ?? DEFAULT_CONFIG.teamSynthesizer;
    if (typeof selected !== "string" || !ACCOUNT_IDS.includes(selected)) {
        throw new InternetError("config_error", `browser config teamSynthesizer must be one of ${ACCOUNT_IDS.join(", ")}`);
    }
    const accountId = selected;
    if (!accountHasCapability(accountId, "team.synthesize")) {
        throw new InternetError("config_error", `browser config teamSynthesizer account ${accountId} cannot synthesize teams`);
    }
    return accountId;
}
function asChatGptThinkingLevel(value) {
    if (value === undefined)
        return DEFAULT_CONFIG.chatgptThinkingLevel;
    if (typeof value === "string" && CHATGPT_THINKING_LEVELS.includes(value)) {
        return value;
    }
    throw new InternetError("config_error", `browser config chatgptThinkingLevel must be one of ${CHATGPT_THINKING_LEVELS.join(", ")}`);
}
export function resolveBrowserConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const teamRounds = asPositiveInteger(input.teamRounds, DEFAULT_CONFIG.teamRounds, "teamRounds");
    const teamMaxRounds = asPositiveInteger(input.teamMaxRounds, DEFAULT_CONFIG.teamMaxRounds, "teamMaxRounds");
    const remoteLoginPort = asPositiveInteger(input.remoteLoginPort, DEFAULT_CONFIG.remoteLoginPort, "remoteLoginPort");
    const workflowHardTimeoutMs = asPositiveInteger(input.workflowHardTimeoutMs, DEFAULT_CONFIG.workflowHardTimeoutMs, "workflowHardTimeoutMs");
    const workflowStallTimeoutMs = asPositiveInteger(input.workflowStallTimeoutMs, DEFAULT_CONFIG.workflowStallTimeoutMs, "workflowStallTimeoutMs");
    const maxRemoteLoginBasePort = 65_535 - (ACCOUNT_IDS.length - 1);
    if (remoteLoginPort > maxRemoteLoginBasePort) {
        throw new InternetError("config_error", `browser config remoteLoginPort must not exceed ${maxRemoteLoginBasePort}`);
    }
    if (teamRounds > teamMaxRounds) {
        throw new InternetError("config_error", "browser config teamRounds must not exceed teamMaxRounds");
    }
    if (workflowStallTimeoutMs >= workflowHardTimeoutMs) {
        throw new InternetError("config_error", "browser config workflowStallTimeoutMs must be less than workflowHardTimeoutMs");
    }
    return {
        chromePath: typeof input.chromePath === "string" && input.chromePath.length > 0 ? expandHome(input.chromePath) : undefined,
        dataDir: resolve(typeof input.dataDir === "string" && input.dataDir.length > 0
            ? expandHome(input.dataDir)
            : DEFAULT_CONFIG.dataDir),
        headless: asBoolean(input.headless, DEFAULT_CONFIG.headless),
        loginTimeoutMs: asPositiveInteger(input.loginTimeoutMs, DEFAULT_CONFIG.loginTimeoutMs, "loginTimeoutMs"),
        remoteLoginPort,
        turnTimeoutMs: asPositiveInteger(input.turnTimeoutMs, DEFAULT_CONFIG.turnTimeoutMs, "turnTimeoutMs"),
        researchTimeoutMs: asPositiveInteger(input.researchTimeoutMs, DEFAULT_CONFIG.researchTimeoutMs, "researchTimeoutMs"),
        workflowHardTimeoutMs,
        workflowStallTimeoutMs,
        pollMs: asPositiveInteger(input.pollMs, DEFAULT_CONFIG.pollMs, "pollMs"),
        stableMs: asPositiveInteger(input.stableMs, DEFAULT_CONFIG.stableMs, "stableMs"),
        closeAfterMs: asPositiveInteger(input.closeAfterMs, DEFAULT_CONFIG.closeAfterMs, "closeAfterMs"),
        maxConcurrentTurnsPerAccount: asPositiveInteger(input.maxConcurrentTurnsPerAccount, DEFAULT_CONFIG.maxConcurrentTurnsPerAccount, "maxConcurrentTurnsPerAccount"),
        maxOutputChars: asPositiveInteger(input.maxOutputChars, DEFAULT_CONFIG.maxOutputChars, "maxOutputChars"),
        teamRounds,
        teamMaxRounds,
        teamTranscriptMaxChars: asPositiveInteger(input.teamTranscriptMaxChars, DEFAULT_CONFIG.teamTranscriptMaxChars, "teamTranscriptMaxChars"),
        teamSynthesis: asBoolean(input.teamSynthesis, DEFAULT_CONFIG.teamSynthesis),
        teamSynthesizer: asTeamSynthesizer(input.teamSynthesizer),
        enableChatgpt: asBoolean(input.enableChatgpt, DEFAULT_CONFIG.enableChatgpt),
        enableGemini: asBoolean(input.enableGemini, DEFAULT_CONFIG.enableGemini),
        chatgptThinkingLevel: asChatGptThinkingLevel(input.chatgptThinkingLevel),
    };
}
//# sourceMappingURL=config.js.map