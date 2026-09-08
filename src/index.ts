import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { defineWorkflowCommand } from "#internet/commands/workflow";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { resolveBrowserConfig } from "#internet/core/config";
import { defineInternetBrowserTool } from "#internet/tools/internet-browser";
import { defineInternetChatTool } from "#internet/tools/internet-chat";
import { defineInternetResearchTool } from "#internet/tools/internet-research";
import { defineInternetTeamTool } from "#internet/tools/internet-team";

/** Cordis plugin name used by loader diagnostics. */
export const name = "internet";

/** Services required by this plugin. */
export const inject = ["tools", "systemPrompt", "commands"] as const;

const INTERNET_CHAT_GUIDANCE = [
	"Use internet_chat for one answer or a durable multi-turn exchange through an explicitly selected thinker account: chatgpt-thinker or gemini-thinker.",
	"Each account resumes one native conversation for the current DSH session. The automated browser is hidden by default on the managed display; set visible: true only when the user asks to watch or when live UI inspection is needed.",
	"ChatGPT selects and verifies the configured reasoning level before every turn (High by default). Gemini selects and verifies the observed latest Flash model with Extended thinking before every ordinary turn; provider-native Deep Research uses its own mode.",
	"If an account is missing or requires reauthentication, use internet_browser status and then login with that exact account ID. chatgpt-thinker and chatgpt-writer have separate login state and must never share credentials or browser storage.",
	"internet_chat cannot read local files or search the web by itself. Paste required material into the prompt and gather current sources with web_search or web_fetch first.",
].join(" ");

const INTERNET_RESEARCH_GUIDANCE =
	"Use internet_research for provider-native Deep Research rather than ordinary internet_chat when the user needs a sourced, long-running investigation. It runs through explicitly selected thinker accounts, isolates durable conversations per account under a research name, and may return partial success when only one account completes.";

const INTERNET_TEAM_GUIDANCE = [
	"Use internet_team when multiple independent web-model perspectives should be debated and merged: design decisions, tradeoff analysis, brainstorming, code or document review, second opinions, and adversarial review.",
	"Each child agent has a unique DSH agent id, so its internet_team uses distinct durable account threads under <child-agent-id>:team:<name>, isolated from the parent's direct and team conversations.",
	"The default profile serializes hidden turns per authenticated account to protect portable account state. Set maxConcurrentTurnsPerAccount above one only after confirming account-state acceptance; different accounts have independent schedulers.",
	"For one simple debate, call internet_team directly. Thinker accounts speak sequentially in the configured order once per round (default 2, maximum 4). When synthesis is enabled, chatgpt-thinker is the default explicit synthesizer.",
	"Named teams have durable conversations isolated by account and team. Account browsers are hidden by default; set visible: true only when the user asks to watch them or requests live acceptance testing.",
	"The tool returns only the final answer by default. includeTranscript: true adds a bounded current-call transcript with account identity and truncation metadata.",
	"Every selected account needs its own ready portable account state. A model refusal is model output, while login, timeout, and DOM failures are orchestration errors that should be reported distinctly.",
	"internet_team cannot search the web or read files. Paste all source material into task, and use web_search or web_fetch before the debate when current information is required.",
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

function enabledAccounts(config: ReturnType<typeof resolveBrowserConfig>): Set<AccountId> {
	return new Set(
		ACCOUNT_IDS.filter((accountId) => {
			const provider = getAccountDefinition(accountId).provider;
			return provider === "chatgpt-web" ? config.enableChatgpt : config.enableGemini;
		}),
	);
}

/** Register browser-backed tools over explicit semantic account identities. */
export function apply(ctx: PluginContext, rawConfig: unknown): void {
	const config = resolveBrowserConfig(rawConfig);
	const manager = new BrowserManager(config);
	ctx.effect(() => () => manager.dispose());

	const accounts = enabledAccounts(config);
	if (accounts.size === 0) return;
	const thinkers = new Set(
		[...accounts].filter((accountId) => getAccountDefinition(accountId).role === "thinker"),
	);

	if (accounts.has("chatgpt-thinker")) ctx.commands.register(defineInternetCommand(manager));

	ctx.tools.register(defineInternetBrowserTool(manager, accounts));
	if (thinkers.size > 0) {
		ctx.tools.register(defineInternetChatTool(manager, config.turnTimeoutMs, thinkers));
		ctx.tools.register(defineInternetResearchTool(manager, config, thinkers));
		ctx.systemPrompt?.section?.({
			name: "tool:internet_research",
			order: 119,
			text: INTERNET_RESEARCH_GUIDANCE,
		});
		ctx.systemPrompt?.section?.({
			name: "tool:internet_chat",
			order: 120,
			text: INTERNET_CHAT_GUIDANCE,
		});
	}
	if (thinkers.has("chatgpt-thinker") && thinkers.has("gemini-thinker")) {
		ctx.commands.register(defineWorkflowCommand());
		ctx.tools.register(defineInternetTeamTool(manager, config, thinkers));
		ctx.systemPrompt?.section?.({
			name: "tool:internet_team",
			order: 121,
			text: INTERNET_TEAM_GUIDANCE,
		});
	}
}

export { BrowserManager } from "#internet/browser/runtime";
export type { AccountCapability, AccountDefinition, AccountId, AccountRole } from "#internet/core/accounts";
export {
	ACCOUNT_CAPABILITIES,
	ACCOUNT_IDS,
	ACCOUNT_ROLES,
	ACCOUNTS,
	accountHasCapability,
	accountsForProvider,
	accountsWithCapabilities,
	getAccountDefinition,
	isAccountId,
} from "#internet/core/accounts";
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
export type { ChatInput, ResearchInput, TeamInput } from "#internet/tools/args";
export { parseChatArgs, parseResearchArgs, parseTeamArgs } from "#internet/tools/args";
