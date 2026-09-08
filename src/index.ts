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
import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";

export const name = "internet";
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

const INTERNET_WORKFLOW_GUIDANCE = [
	"Use internet_workflow as the deterministic control-plane surface for durable coding jobs. /workflow <task> is the normal user entry point and creates the same durable engine job after resolving the current Git repository and exact revision.",
	"Workflow state, account routing, team lane identities, writer conversation identity, handoff receipts, PR receipt, review cycle, pending action, and compact last event are persisted outside model context.",
	"Workflow-owned team execution calls the lower-level team runtime directly with deterministic prompts and per-job lanes; no free-form child agent is needed merely to call internet_team.",
	"Research finals are materialized as exact SHA-256-bound durable handoffs. Data-plane payloads are separate from trusted control messages, and START_IMPLEMENTATION is gated on delivery of both research handoffs.",
	"Writer/PR execution, approval classification, review-loop driving, Local events, and merge binding remain later workflow phases.",
].join(" ");

export interface PluginContext {
	tools: { register(tool: ReturnType<typeof defineTool>): void };
	commands: { register(command: CommandDefinition): void };
	systemPrompt?: { section(options: { name: string; order: number; text: string }): void };
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

export function apply(ctx: PluginContext, rawConfig: unknown): void {
	const config = resolveBrowserConfig(rawConfig);
	const manager = new BrowserManager(config);
	ctx.effect(() => () => manager.dispose());

	const accounts = enabledAccounts(config);
	if (accounts.size === 0) return;
	const thinkers = new Set([...accounts].filter((accountId) => getAccountDefinition(accountId).role === "thinker"));

	if (accounts.has("chatgpt-thinker")) ctx.commands.register(defineInternetCommand(manager));

	ctx.tools.register(defineInternetBrowserTool(manager, accounts));
	if (thinkers.size > 0) {
		ctx.tools.register(defineInternetChatTool(manager, config.turnTimeoutMs, thinkers));
		ctx.tools.register(defineInternetResearchTool(manager, config, thinkers));
		ctx.systemPrompt?.section?.({ name: "tool:internet_research", order: 119, text: INTERNET_RESEARCH_GUIDANCE });
		ctx.systemPrompt?.section?.({ name: "tool:internet_chat", order: 120, text: INTERNET_CHAT_GUIDANCE });
	}
	if (thinkers.has("chatgpt-thinker") && thinkers.has("gemini-thinker")) {
		const workflowEngine = new WorkflowEngine(
			new WorkflowJobStore(config.dataDir),
			new BrowserWorkflowTeamRunner(manager, config),
			new WorkflowTeamPromptBuilder(),
			new WorkflowHandoffStore(config.dataDir),
		);
		ctx.commands.register(defineWorkflowCommand({ engine: workflowEngine }));
		ctx.tools.register(defineInternetWorkflowTool(workflowEngine));
		ctx.tools.register(defineInternetTeamTool(manager, config, thinkers));
		ctx.systemPrompt?.section?.({ name: "tool:internet_workflow", order: 121, text: INTERNET_WORKFLOW_GUIDANCE });
		ctx.systemPrompt?.section?.({ name: "tool:internet_team", order: 122, text: INTERNET_TEAM_GUIDANCE });
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
export type { OtherContribution, TeamFailure, TeamOptions, TeamResult, TeamSuccess, TeamTurn } from "#internet/team/orchestrator";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export type { ChatInput, ResearchInput, TeamInput } from "#internet/tools/args";
export { parseChatArgs, parseResearchArgs, parseTeamArgs } from "#internet/tools/args";
export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";
export type { WorkflowControlKind, WorkflowControlMessage } from "#internet/workflow/control";
export { createWorkflowControlMessage, WORKFLOW_CONTROL_KINDS } from "#internet/workflow/control";
export type { WorkflowControlStep } from "#internet/workflow/engine";
export { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";
export type {
	CreateWorkflowHandoffInput,
	WorkflowHandoff,
	WorkflowHandoffStatus,
} from "#internet/workflow/handoff-store";
export {
	HANDOFF_SCHEMA,
	hashHandoffPayload,
	parseWorkflowHandoff,
	WorkflowHandoffStore,
	WorkflowHandoffStoreError,
} from "#internet/workflow/handoff-store";
export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";
export type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
export { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
export type { WorkflowTeamRunner, WorkflowTeamRunRequest, WorkflowTeamRunResult } from "#internet/workflow/team-runner";
export { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
export type {
	StartWorkflowInput,
	WorkflowAccountRouting,
	WorkflowDecisionInput,
	WorkflowEventRecord,
	WorkflowHandoffReceipt,
	WorkflowJob,
	WorkflowPendingAction,
	WorkflowPullRequestReceipt,
	WorkflowState,
	WorkflowTeamResult,
	WorkflowTeamRun,
	WorkflowTeamStatus,
} from "#internet/workflow/types";
export { TERMINAL_WORKFLOW_STATES, WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES } from "#internet/workflow/types";
