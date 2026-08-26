import { homedir } from "node:os";
import { join } from "node:path";
import S from "@deepseek-ai/schemastery";
import { InternetError } from "#internet/core/errors";

/** Browser-backed web providers this plugin can drive. */
export type WebProvider = "chatgpt-web" | "gemini-web";

/** Known provider ids, used to validate tool arguments. */
export const WEB_PROVIDERS: readonly WebProvider[] = ["chatgpt-web", "gemini-web"];

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
	/** Register the ChatGPT Web provider. */
	enableChatgpt: boolean;
	/** Register the Gemini Web provider. */
	enableGemini: boolean;
}

/** Resolve the DeepSeek Harness home (mirrors `resolveDshHome`: `$DSH_HOME` or `~/.dsh`). */
function dshHome(): string {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

export const DEFAULT_CONFIG: Required<Omit<BrowserConfig, "chromePath">> = {
	dataDir: join(dshHome(), "internet"),
	headless: false,
	loginTimeoutMs: 180_000,
	turnTimeoutMs: 180_000,
	pollMs: 200,
	stableMs: 1_500,
	closeAfterMs: 10_000,
	maxOutputChars: 200_000,
	enableChatgpt: true,
	enableGemini: true,
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
	enableChatgpt: S.boolean().default(DEFAULT_CONFIG.enableChatgpt),
	enableGemini: S.boolean().default(DEFAULT_CONFIG.enableGemini),
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
	if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) {
		throw new InternetError("config_error", `browser config ${name} must be a positive number`);
	}
	return typeof value === "number" ? Math.floor(value) : fallback;
}

/**
 * Resolve raw plugin config (from the DSH profile) into a validated
 * {@link BrowserConfig}. Unknown fields are ignored; missing fields fall back
 * to defaults. Invalid explicit values fail loudly rather than silently.
 */
export function resolveBrowserConfig(raw: unknown): BrowserConfig {
	const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		chromePath:
			typeof input.chromePath === "string" && input.chromePath.length > 0 ? expandHome(input.chromePath) : undefined,
		dataDir:
			typeof input.dataDir === "string" && input.dataDir.length > 0
				? expandHome(input.dataDir)
				: DEFAULT_CONFIG.dataDir,
		headless: asBoolean(input.headless, DEFAULT_CONFIG.headless),
		loginTimeoutMs: asPositiveInteger(input.loginTimeoutMs, DEFAULT_CONFIG.loginTimeoutMs, "loginTimeoutMs"),
		turnTimeoutMs: asPositiveInteger(input.turnTimeoutMs, DEFAULT_CONFIG.turnTimeoutMs, "turnTimeoutMs"),
		pollMs: asPositiveInteger(input.pollMs, DEFAULT_CONFIG.pollMs, "pollMs"),
		stableMs: asPositiveInteger(input.stableMs, DEFAULT_CONFIG.stableMs, "stableMs"),
		closeAfterMs: asPositiveInteger(input.closeAfterMs, DEFAULT_CONFIG.closeAfterMs, "closeAfterMs"),
		maxOutputChars: asPositiveInteger(input.maxOutputChars, DEFAULT_CONFIG.maxOutputChars, "maxOutputChars"),
		enableChatgpt: asBoolean(input.enableChatgpt, DEFAULT_CONFIG.enableChatgpt),
		enableGemini: asBoolean(input.enableGemini, DEFAULT_CONFIG.enableGemini),
	};
}
