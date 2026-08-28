import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";
import { defineInternetBrowserTool } from "#internet/tools/browser";
import { defineBrowserChatTool } from "#internet/tools/browser-chat";
import { defineBrowserTeamTool } from "#internet/tools/browser-team";

/** Cordis plugin name used by loader diagnostics. */
export const name = "internet";

/** Services required by this plugin. */
export const inject = ["tools", "systemPrompt", "commands"] as const;

const BROWSER_CHAT_GUIDANCE = [
	"Use browser_chat for one answer or a durable multi-turn exchange with ChatGPT Web or Gemini Web through the authenticated provider website.",
	"Each provider resumes one native conversation for the current DSH session. The automated browser is hidden by default on the managed display; set visible: true only when the user asks to watch or when live UI inspection is needed.",
	"ChatGPT selects and verifies the configured reasoning level before every turn (Medium by default). Prompt submission is accepted only after complete editor read-back and the semantic Send action becomes ready.",
	"If a provider is missing or requires reauthentication, use internet_browser status and then login. On a desktop, the user signs in through dedicated normal Chrome and closes it completely. On a displayless server, or when remote: true is requested, relay the returned SSH port-forward command and complete tokenized noVNC URL; tell the user to sign in, press Save account, and check status until ready.",
	"browser_chat cannot read local files or search the web by itself. Paste required material into the prompt and gather current sources with web_search or web_fetch first.",
].join(" ");

const BROWSER_TEAM_GUIDANCE = [
	"Use browser_team when multiple independent web-model perspectives should be debated and merged: design decisions, tradeoff analysis, brainstorming, code or document review, second opinions, and adversarial review.",
	"For several independent aspects, prefer one focused background subagent (or context-inheriting subagent_fork) per aspect. Assign each worker a browser_team debate, continue useful parent work while they run, then combine their returned findings when needed; do not busy-poll.",
	"Each child agent has a unique DSH agent id, so its browser_team uses distinct durable provider threads under <child-agent-id>:team:<name>, isolated from the parent's direct and team conversations. A subagent explicitly assigned a browser_team debate should call browser_team itself rather than recursively delegating it.",
	"The default profile runs one hidden turn per provider, so child debates queue at ChatGPT or Gemini. A policy-compliant maxConcurrentTurnsPerProvider setting above one can overlap hidden turns from different child session ids; same-session turns, visible calls, login, and one team's dependent rounds remain ordered.",
	"For one simple debate, call browser_team directly. Providers speak sequentially in the configured order once per round (default 2, maximum 4). By default the last provider then synthesizes the full current-call debate into one final answer.",
	"Named teams have durable provider conversations isolated from direct browser_chat threads. Provider browsers are hidden by default; set visible: true only when the user asks to watch both browsers or requests live acceptance testing.",
	"The tool returns only the final answer by default. includeTranscript: true adds a bounded current-call transcript with truncation metadata and uses more agent context.",
	"Every selected provider needs a ready portable account. A model refusal is provider output, while login, timeout, and DOM failures are orchestration errors that should be reported distinctly.",
	"browser_team cannot search the web or read files. Paste all source material into task, and use web_search or web_fetch before the debate when current information is required.",
].join(" ");

/** Minimal context surface this plugin uses; injected services are real DSH objects at runtime. */
export interface PluginContext {
	tools: { register(tool: ReturnType<typeof defineTool>): void };
	commands: { register(command: CommandDefinition): void };
	systemPrompt?: {
		section(options: { name: string; order: number; text: string }): void;
	};
	effect(fn: () => (() => void | Promise<void>) | void): void;
}

/**
 * Register the browser-backed web tools. The {@link BrowserManager} is created
 * lazily (Chrome is only discovered on first use) and disposed through a
 * Cordis effect so no browser process outlives the plugin.
 */
export function apply(ctx: PluginContext, rawConfig: unknown): void {
	const config = resolveBrowserConfig(rawConfig);
	const manager = new BrowserManager(config);
	ctx.effect(() => () => manager.dispose());

	const allowed = new Set<WebProvider>();
	if (config.enableChatgpt) {
		allowed.add("chatgpt-web");
		ctx.commands.register(defineInternetCommand(manager));
	}
	if (config.enableGemini) allowed.add("gemini-web");
	if (allowed.size === 0) return;

	ctx.tools.register(defineBrowserChatTool(manager, config.turnTimeoutMs, allowed));
	ctx.tools.register(defineInternetBrowserTool(manager, allowed));
	if (allowed.size >= 2) {
		ctx.tools.register(defineBrowserTeamTool(manager, config, allowed));
		ctx.systemPrompt?.section?.({
			name: "tool:browser_team",
			order: 121,
			text: BROWSER_TEAM_GUIDANCE,
		});
	}
	ctx.systemPrompt?.section?.({
		name: "tool:browser_chat",
		order: 120,
		text: BROWSER_CHAT_GUIDANCE,
	});
}

export { BrowserManager } from "#internet/browser/runtime";
export type { BrowserConfig, ChatGptThinkingLevel, WebProvider } from "#internet/core/config";
export { CHATGPT_THINKING_LEVELS, Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export type {
	OtherContribution,
	TeamFailure,
	TeamOptions,
	TeamResult,
	TeamSuccess,
	TeamTurn,
} from "#internet/team/orchestrator";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export type { TeamInput } from "#internet/tools/args";
export { parseChatArgs, parseTeamArgs } from "#internet/tools/args";
