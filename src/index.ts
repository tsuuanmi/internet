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
import { defineInternetWorkflowMaintenanceTool } from "#internet/tools/internet-workflow-maintenance";
import { WorkflowDriver } from "#internet/workflow/driver";
import { WorkflowEngine } from "#internet/workflow/engine";
import { DshWorkflowEventSink, type WorkflowAgentRegistry } from "#internet/workflow/events";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowOperator } from "#internet/workflow/operator";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { DurableWorkflowTeamObserver } from "#internet/workflow/team-observer";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
import { WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";
import { BrowserWorkflowWriterRunner } from "#internet/workflow/writer-runner";

export const name = "internet";
export const inject = ["tools", "systemPrompt", "commands", "agents"] as const;

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
	"Use internet_team when multiple independent web-model perspectives should be debated and synthesized into the strongest supported result.",
	"The shared team engine deliberately seeks the best of both ChatGPT and Gemini: peer output is untrusted evidence to critique, disagreements are resolved using task evidence, and synthesis selects the strongest parts rather than averaging or concatenating answers.",
	"Each child agent has a unique DSH agent id, so its internet_team uses distinct durable account threads under <child-agent-id>:team:<name>, isolated from the parent's direct and team conversations.",
	"The default profile serializes hidden turns per authenticated account to protect portable account state. Different accounts have independent schedulers; workflow lane concurrency must not add an A-then-B mutex above those account-level limits.",
	"For one simple debate, call internet_team directly. Thinker accounts speak sequentially in configured order once per round (default 2, maximum 4). When synthesis is enabled, chatgpt-thinker is the default explicit synthesizer.",
	"Named teams have durable conversations isolated by account and team. Account browsers are hidden by default; set visible: true only when the user asks to watch them or requests live acceptance testing.",
	"The tool returns only the final answer by default. includeTranscript: true adds a bounded current-call transcript with account identity and truncation metadata.",
	"Every selected account needs its own ready portable account state. Provider/browser execution failures are orchestration errors, not valid model contributions.",
].join(" ");

const INTERNET_WORKFLOW_GUIDANCE = [
	"Use /workflow <task> as the normal entry point for a durable coding workflow. Use /workflow list, /workflow status [jobId], /workflow watch [jobId], /workflow stop [jobId], and /workflow continue [jobId] for operator control without reading private JSON files manually.",
	"Research A/B and Review A/B are independent full ChatGPT+Gemini agent-team lanes and are launched concurrently at the workflow level. Same-account turns may still serialize through the account scheduler for browser/account safety.",
	"The shared team core emits bounded durable per-turn traces with phase/lane/attempt/round/account/stage/failure evidence. Compact PROGRESS events go to Local without injecting full model payloads.",
	"WorkflowDriver advances runnable engine states automatically through research, exact handoffs, writer implementation, PR review/remediation, and the explicit merge-authorization boundary. Safe in-flight states are rediscovered after plugin restart; action-required and rejected-merge states remain stopped until explicit user/operator action.",
	"Research and review finals are materialized as exact SHA-256-bound durable handoffs. The separate chatgpt-writer account receives exact payloads and trusted controls in one persistent per-job conversation.",
	"Scoped Website confirmation classification is fail-closed. Exact-head review, PR health, merge authorization, and immediate pre-merge revalidation remain authoritative merge gates.",
	"internet_workflow remains the deterministic lower-level control-plane tool, including the real end-to-end acceptance test. Workflow retention remains explicit operator maintenance only.",
].join(" ");

export interface PluginContext {
	agents: WorkflowAgentRegistry;
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
	if (thinkers.has("chatgpt-thinker") && thinkers.has("gemini-thinker") && accounts.has("chatgpt-writer")) {
		const workflowJobs = new WorkflowJobStore(config.dataDir);
		const workflowTraces = new WorkflowTeamTraceStore(config.dataDir);
		const workflowEvents = new DshWorkflowEventSink(ctx.agents);
		const workflowObserver = new DurableWorkflowTeamObserver(workflowTraces, workflowJobs, workflowEvents);
		const workflowEngine = new WorkflowEngine(
			workflowJobs,
			new BrowserWorkflowTeamRunner(manager, config, workflowObserver),
			new WorkflowTeamPromptBuilder(),
			new WorkflowHandoffStore(config.dataDir),
			new BrowserWorkflowWriterRunner(manager),
			3,
			workflowEvents,
		);
		const workflowDriver = new WorkflowDriver(workflowEngine, workflowJobs);
		const workflowOperator = new WorkflowOperator(workflowEngine, workflowDriver, workflowJobs, workflowTraces);
		ctx.effect(() => () => workflowDriver.dispose());
		workflowDriver.resumeActive();
		ctx.commands.register(
			defineWorkflowCommand({ engine: workflowEngine, driver: workflowDriver, operator: workflowOperator }),
		);
		ctx.tools.register(defineInternetWorkflowTool(workflowEngine, workflowDriver, { browser: manager }));
		ctx.tools.register(
			defineInternetWorkflowMaintenanceTool(new WorkflowRetentionManager(config.dataDir, workflowJobs)),
		);
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
export type {
	OtherContribution,
	TeamFailure,
	TeamFailureDetail,
	TeamOptions,
	TeamProgressEvent,
	TeamResult,
	TeamStage,
	TeamSuccess,
	TeamTurn,
} from "#internet/team/orchestrator";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export type { TeamPromptStrategy, TeamPromptStrategyId } from "#internet/team/prompt-strategy";
export { getTeamPromptStrategy, TEAM_PROMPT_STRATEGIES } from "#internet/team/prompt-strategy";
export type { ChatInput, ResearchInput, TeamInput } from "#internet/tools/args";
export { parseChatArgs, parseResearchArgs, parseTeamArgs } from "#internet/tools/args";
export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";
export {
	defineInternetWorkflowMaintenanceTool,
	WORKFLOW_MAINTENANCE_OPERATIONS,
} from "#internet/tools/internet-workflow-maintenance";
export type { WorkflowControlKind, WorkflowControlMessage } from "#internet/workflow/control";
export { createWorkflowControlMessage, WORKFLOW_CONTROL_KINDS } from "#internet/workflow/control";
export type { WorkflowDriverEngine } from "#internet/workflow/driver";
export { WorkflowDriver } from "#internet/workflow/driver";
export type { WorkflowControlStep } from "#internet/workflow/engine";
export { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";
export type { WorkflowAgentRegistry, WorkflowEventSink, WorkflowLocalAgent } from "#internet/workflow/events";
export { DshWorkflowEventSink, formatWorkflowEvent } from "#internet/workflow/events";
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
export {
	formatWorkflowList,
	formatWorkflowStatus,
	WorkflowOperator,
	WorkflowOperatorError,
} from "#internet/workflow/operator";
export type {
	WorkflowCleanupAudit,
	WorkflowCleanupCandidate,
	WorkflowRetentionPolicy,
} from "#internet/workflow/retention";
export {
	DEFAULT_WORKFLOW_RETENTION_POLICY,
	WORKFLOW_RETENTION_AUDIT_SCHEMA,
	WorkflowRetentionError,
	WorkflowRetentionManager,
} from "#internet/workflow/retention";
export type { WorkflowReviewResult, WorkflowReviewVerdict } from "#internet/workflow/review-result";
export { parseWorkflowReviewResult, WORKFLOW_REVIEW_VERDICTS } from "#internet/workflow/review-result";
export type {
	WorkflowTeamContext,
	WorkflowTeamObservation,
	WorkflowTeamObserver,
} from "#internet/workflow/team-observer";
export { DurableWorkflowTeamObserver, parseWorkflowTeamSessionId } from "#internet/workflow/team-observer";
export type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
export { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
export type { WorkflowTeamRunner, WorkflowTeamRunRequest, WorkflowTeamRunResult } from "#internet/workflow/team-runner";
export { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
export type { WorkflowTeamTraceEvent, WorkflowTeamTraceStage } from "#internet/workflow/team-trace-store";
export {
	MAX_WORKFLOW_TEAM_TRACE_EVENTS,
	MAX_WORKFLOW_TEAM_TRACE_TEXT_CHARS,
	WORKFLOW_TEAM_TRACE_SCHEMA,
	WorkflowTeamTraceStore,
	WorkflowTeamTraceStoreError,
} from "#internet/workflow/team-trace-store";
export type {
	StartWorkflowInput,
	WorkflowAccountRouting,
	WorkflowCiReceipt,
	WorkflowCiStatus,
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
export {
	TERMINAL_WORKFLOW_STATES,
	WORKFLOW_CI_STATUSES,
	WORKFLOW_STATES,
	WORKFLOW_TEAM_STATUSES,
} from "#internet/workflow/types";
export type {
	WorkflowWriterControlRequest,
	WorkflowWriterDeliveryRequest,
	WorkflowWriterResult,
	WorkflowWriterRunner,
} from "#internet/workflow/writer-runner";
export { BrowserWorkflowWriterRunner, parseWorkflowWriterResult } from "#internet/workflow/writer-runner";
