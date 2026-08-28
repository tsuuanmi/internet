import { homedir } from "node:os";
import { join, resolve } from "node:path";
import S from "@deepseek-ai/schemastery";
import { InternetError } from "#internet/core/errors";

/** Browser-backed web providers this plugin can drive. */
export type WebProvider = "chatgpt-web" | "gemini-web";

/** Known provider ids, used to validate tool arguments. */
export const WEB_PROVIDERS: readonly WebProvider[] = ["chatgpt-web", "gemini-web"];

/**
 * ChatGPT Web reasoning-effort levels, ordered by the UI index the model
 * switcher exposes (Instant=0 … Pro=4). "Medium" is the default so ChatGPT
 * turns reason at GPT-5.6-Sol Medium instead of Instant.
 */
export type ChatGptThinkingLevel = "instant" | "medium" | "high" | "extra-high" | "pro";

/** Known ChatGPT thinking levels, used to validate config and tool arguments. */
export const CHATGPT_THINKING_LEVELS: readonly ChatGptThinkingLevel[] = [
	"instant",
	"medium",
	"high",
	"extra-high",
	"pro",
];

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

/** Resolve the DeepSeek Harness home (mirrors `resolveDshHome`: `$DSH_HOME` or `~/.dsh`). */
function dshHome(): string {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

export const DEFAULT_CONFIG: Required<Omit<BrowserConfig, "chromePath">> = {
	dataDir: join(dshHome(), "internet"),
	headless: false,
	loginTimeoutMs: 600_000,
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
	chatgptThinkingLevel: "instant",
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

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** Expand a leading `~` to the user's home directory (keeps absolute paths intact). */
function expandHome(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

function asPositiveInteger(value: unknown, fallback: number, name: string): number {
	if (typeof value === "number" && (!Number.isFinite(value) || value < 1)) {
		throw new InternetError("config_error", `browser config ${name} must be at least 1`);
	}
	return typeof value === "number" ? Math.floor(value) : fallback;
}

function asChatGptThinkingLevel(value: unknown): ChatGptThinkingLevel {
	if (value === undefined) return DEFAULT_CONFIG.chatgptThinkingLevel;
	if (typeof value === "string" && (CHATGPT_THINKING_LEVELS as readonly string[]).includes(value)) {
		return value as ChatGptThinkingLevel;
	}
	throw new InternetError(
		"config_error",
		`browser config chatgptThinkingLevel must be one of ${CHATGPT_THINKING_LEVELS.join(", ")}`,
	);
}

/**
 * Resolve raw plugin config (from the DSH profile) into a validated
 * {@link BrowserConfig}. Unknown fields are ignored; missing fields fall back
 * to defaults. Invalid explicit values fail loudly rather than silently.
 */
export function resolveBrowserConfig(raw: unknown): BrowserConfig {
	const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const teamRounds = asPositiveInteger(input.teamRounds, DEFAULT_CONFIG.teamRounds, "teamRounds");
	const teamMaxRounds = asPositiveInteger(input.teamMaxRounds, DEFAULT_CONFIG.teamMaxRounds, "teamMaxRounds");
	if (teamRounds > teamMaxRounds) {
		throw new InternetError("config_error", "browser config teamRounds must not exceed teamMaxRounds");
	}
	return {
		chromePath:
			typeof input.chromePath === "string" && input.chromePath.length > 0 ? expandHome(input.chromePath) : undefined,
		dataDir: resolve(
			typeof input.dataDir === "string" && input.dataDir.length > 0
				? expandHome(input.dataDir)
				: DEFAULT_CONFIG.dataDir,
		),
		headless: asBoolean(input.headless, DEFAULT_CONFIG.headless),
		loginTimeoutMs: asPositiveInteger(input.loginTimeoutMs, DEFAULT_CONFIG.loginTimeoutMs, "loginTimeoutMs"),
		turnTimeoutMs: asPositiveInteger(input.turnTimeoutMs, DEFAULT_CONFIG.turnTimeoutMs, "turnTimeoutMs"),
		pollMs: asPositiveInteger(input.pollMs, DEFAULT_CONFIG.pollMs, "pollMs"),
		stableMs: asPositiveInteger(input.stableMs, DEFAULT_CONFIG.stableMs, "stableMs"),
		closeAfterMs: asPositiveInteger(input.closeAfterMs, DEFAULT_CONFIG.closeAfterMs, "closeAfterMs"),
		maxOutputChars: asPositiveInteger(input.maxOutputChars, DEFAULT_CONFIG.maxOutputChars, "maxOutputChars"),
		teamRounds,
		teamMaxRounds,
		teamTranscriptMaxChars: asPositiveInteger(
			input.teamTranscriptMaxChars,
			DEFAULT_CONFIG.teamTranscriptMaxChars,
			"teamTranscriptMaxChars",
		),
		teamSynthesis: asBoolean(input.teamSynthesis, DEFAULT_CONFIG.teamSynthesis),
		enableChatgpt: asBoolean(input.enableChatgpt, DEFAULT_CONFIG.enableChatgpt),
		enableGemini: asBoolean(input.enableGemini, DEFAULT_CONFIG.enableGemini),
		chatgptThinkingLevel: asChatGptThinkingLevel(input.chatgptThinkingLevel),
	};
}
