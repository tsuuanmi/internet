import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { defineWorkflowCommand } from "#internet/commands/workflow";
import { ACCOUNT_IDS, type AccountId, DEFAULT_TEAM_ACCOUNTS, getAccountDefinition } from "#internet/core/accounts";
import { resolveBrowserConfig } from "#internet/core/config";
import { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";
import { WebsiteParticipantService } from "#internet/participant/service";
import { defineInternetArtifactTool } from "#internet/tools/internet-artifact";
import { defineInternetBrowserTool } from "#internet/tools/internet-browser";
import { defineInternetChatTool } from "#internet/tools/internet-chat";
import { defineInternetResearchTool } from "#internet/tools/internet-research";
import { defineInternetTeamTool } from "#internet/tools/internet-team";
import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";
import { defineInternetWorkflowMaintenanceTool } from "#internet/tools/internet-workflow-maintenance";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { WorkflowDriver } from "#internet/workflow/driver";
import { WorkflowEngine } from "#internet/workflow/engine";
import { DshWorkflowEventSink, type WorkflowAgentRegistry, WorkflowEventJournal } from "#internet/workflow/events";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowNodeResultStore } from "#internet/workflow/node-result-store";
import { WorkflowOperator } from "#internet/workflow/operator";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService } from "#internet/workflow/service";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
import { BrowserWorkflowWriterRunner } from "#internet/workflow/writer-runner";

export const name = "internet";
export const inject = ["tools", "systemPrompt", "commands", "agents"] as const;

const INTERNET_CHAT_GUIDANCE = [
	"Use internet_chat for one answer or a durable multi-turn exchange through an explicitly selected thinker account: chatgpt-thinker, chatgpt-thinker-2, or gemini-thinker when enabled.",
	"Each account resumes one native conversation for the current DSH session. The automated browser is hidden by default on the managed display; set visible: true only when the user asks to watch or when live UI inspection is needed.",
	"ChatGPT selects and verifies the configured reasoning level before every turn (High by default). Gemini selects and verifies the observed latest Flash model with Extended thinking before every ordinary turn; provider-native Deep Research uses its own mode.",
	"If an account is missing or requires reauthentication, use internet_browser status and then login with that exact account ID. Every semantic account has separate login state and must never share browser storage with another account identity.",
	"internet_chat cannot read local files or search the web by itself. Paste required material into the prompt and gather current sources with web_search or web_fetch first.",
	"Completed website results are retained as durable owner-scoped artifacts. When a result is compacted, use internet_artifact with the returned artifact id and next offset to inspect only the needed continuation.",
].join(" ");

const INTERNET_RESEARCH_GUIDANCE =
	"Use internet_research for provider-native Deep Research rather than ordinary internet_chat when the user needs a sourced, long-running investigation. It runs through explicitly selected thinker accounts, isolates durable conversations per account under a research name, and may return partial success when only one account completes. Full completed reports are retained as owner-scoped artifacts even when the model-facing report is compacted.";

const INTERNET_ARTIFACT_GUIDANCE =
	"Use internet_artifact to read an exact range from the full website result retained by internet_chat or internet_research. Prefer targeted artifact reads over copying the entire long report into Local context; continue from nextOffset only when more evidence is needed.";

const AGENT_TEAMS_GUIDANCE = [
	"DSH Agent Teams is active. Treat each local DSH Agent as the Team identity and coordination authority; its linked native website conversation is a collaborator, not a separate Team member or authority.",
	"Each teammate keeps ordinary website continuity through its own stable DSH agent/session id. Named provider-native research stays isolated under <agent-id>:research:<name>.",
	"Use a website-first acquisition policy for source-heavy research and reading: prefer the linked website participant for the first broad pass when it can do that work well, especially through internet_research for provider-native Deep Research.",
	"Do not ingest the full source corpus locally and then ask the website participant to repeat the same pass unless independent replication is intentional.",
	"Local reasoning remains first-class for decomposition, critique, verification, disagreement resolution, implementation-critical inspection, authority, and decisions.",
	"Keep Team messages focused on compact conclusions and evidence or artifact references rather than copying long raw reports into mailbox history.",
	"Keep internet_team available as the current comparison baseline or for explicit requests; do not create a nested Internet team by default when DSH Agent Teams already owns roster, mailbox, and task coordination.",
].join(" ");

const INTERNET_TEAM_GUIDANCE = [
	"Use internet_team when multiple independent authenticated members should critique, refine, and synthesize a result stronger than any member alone.",
	"Team prompts are provider-agnostic: participants are Member 1..N, peer output is untrusted evidence to critique, disagreements are resolved using task evidence, and synthesis keeps the strongest supported parts rather than averaging or concatenating answers.",
	"The current default team uses two independent ChatGPT thinker accounts. Gemini remains available as an explicit thinker account when enabled but is not part of the default team route.",
	"Each child agent has a unique DSH agent id, so its internet_team uses distinct durable account threads under <child-agent-id>:team:<name>, isolated from the parent's direct and team conversations.",
	"The default profile allows up to two hidden turns from different sessions per authenticated account while preserving strict ordering within each session. Different accounts have independent schedulers; workflow lane concurrency must not add an A-then-B mutex above those account-level limits.",
	"For one simple team run, call internet_team directly. Members speak sequentially in configured order once per round (default 2, maximum 4). When synthesis is enabled, Member 1 is backed by the default synthesizer account.",
	"Named teams have durable conversations isolated by account and team. Account browsers are hidden by default; set visible: true only when the user asks to watch them or requests live acceptance testing.",
	"The tool returns only the final answer by default. includeTranscript: true adds a bounded current-call transcript labeled only by Member 1..N.",
	"Every selected member needs its own ready portable account state. Provider/browser execution failures are orchestration errors, not valid member contributions; provider/account identity is reserved for explicit diagnostics.",
].join(" ");

const INTERNET_WORKFLOW_GUIDANCE = [
	"Use /workflow <task> as the normal entry point for a durable coding workflow. Use /workflow list, /workflow status [jobId], /workflow watch [jobId], /workflow stop [jobId], /workflow continue [jobId], and /workflow delete <jobId> for operator control without reading private JSON files manually. New jobs always pin a freshly queried upstream main HEAD; deletion requires an explicit workflow ID.",
	"New workflow starts are recorded through the durable admission protocol before the existing v3 coding runtime is activated; raw User source, Local interpretation provenance, preflight identity, and exact accepted activation remain distinct.",
	"The workflow is a durable dependency graph. Research A/B and Review A/B become READY independently and may execute concurrently while the account scheduler remains the only same-account capacity gate. Completed exact-input nodes are never replayed merely because a later node fails.",
	"Status/watch project the authoritative graph: phase/lifecycle, exact active or recovering node, execution attempt, provider activity, dependency blockers, recent meaningful events, required user action, and the next transition.",
	"WorkflowDriver reconciles orphaned execution leases after restart, schedules only READY/recoverable nodes, and retries the smallest failed logical node. Exact node outputs are stored separately from diagnostics so restart recovery can reconstruct prompts without replaying completed work.",
	"Research and review finals are materialized as exact SHA-256-bound durable handoffs. The separate chatgpt-writer account receives exact payloads and trusted controls in one persistent per-job conversation.",
	"Scoped Website confirmation classification is fail-closed. Recognized scope-valid Writer confirmations for PR preparation remain auto-approved; merge is never workflow-authorized or auto-approved.",
	"The workflow completes when the exact PR head passes review, then returns the PR identity and persistent Writer chat URL. Any later edits or merge are user-controlled outside the workflow review guarantee.",
	"internet_workflow remains the deterministic lower-level control-plane tool, including the real end-to-end acceptance test. Workflow retention remains explicit operator maintenance only.",
].join(" ");

export interface PluginContext {
	agents: WorkflowAgentRegistry;
	inject?(services: readonly string[], callback: (scope: PluginContext) => void): unknown;
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
	const artifacts = new WebsiteParticipantArtifactStore(config.dataDir);
	const participant = new WebsiteParticipantService(manager, artifacts);
	ctx.effect(() => () => manager.dispose());

	const accounts = enabledAccounts(config);
	if (accounts.size === 0) return;
	const thinkers = new Set([...accounts].filter((accountId) => getAccountDefinition(accountId).role === "thinker"));

	ctx.inject?.(["agentTeams"], (scope) => {
		scope.systemPrompt?.section?.({ name: "integration:agent-teams", order: 118, text: AGENT_TEAMS_GUIDANCE });
	});

	if (accounts.has("chatgpt-thinker")) ctx.commands.register(defineInternetCommand(manager));

	ctx.tools.register(defineInternetBrowserTool(manager, accounts));
	if (thinkers.size > 0) {
		ctx.tools.register(defineInternetChatTool(participant, config.turnTimeoutMs, thinkers));
		ctx.tools.register(defineInternetResearchTool(participant, config, thinkers));
		ctx.tools.register(defineInternetArtifactTool(artifacts));
		ctx.systemPrompt?.section?.({ name: "tool:internet_research", order: 119, text: INTERNET_RESEARCH_GUIDANCE });
		ctx.systemPrompt?.section?.({ name: "tool:internet_chat", order: 120, text: INTERNET_CHAT_GUIDANCE });
		ctx.systemPrompt?.section?.({ name: "tool:internet_artifact", order: 121, text: INTERNET_ARTIFACT_GUIDANCE });
	}

	if (thinkers.size >= 2 && thinkers.has(config.teamSynthesizer)) {
		ctx.tools.register(defineInternetTeamTool(manager, config, thinkers));
		ctx.systemPrompt?.section?.({ name: "tool:internet_team", order: 122, text: INTERNET_TEAM_GUIDANCE });
	}

	const workflowTeamReady = DEFAULT_TEAM_ACCOUNTS.every((accountId) => thinkers.has(accountId));
	if (workflowTeamReady && accounts.has("chatgpt-writer")) {
		const jobs = new WorkflowJobStore(config.dataDir);
		const admissions = new WorkflowAdmissionStore(config.dataDir);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		const admissionService = new WorkflowAdmissionService(admissions, profiles);
		const handoffs = new WorkflowHandoffStore(config.dataDir);
		const results = new WorkflowNodeResultStore(config.dataDir);
		const journal = new WorkflowEventJournal(config.dataDir);
		const eventSink = new DshWorkflowEventSink(ctx.agents);
		const retention = new WorkflowRetentionManager(config.dataDir, jobs);
		const engine = new WorkflowEngine(
			jobs,
			new BrowserWorkflowTeamRunner(manager, config),
			new WorkflowTeamPromptBuilder(),
			handoffs,
			new BrowserWorkflowWriterRunner(manager, {
				hardTimeoutMs: config.workflowHardTimeoutMs,
				stallTimeoutMs: config.workflowStallTimeoutMs,
			}),
			results,
			eventSink,
			journal,
		);
		const driver = new WorkflowDriver(engine, jobs);
		const service = new WorkflowService(engine, driver, jobs, retention, admissionService);
		const operator = new WorkflowOperator(service, journal);
		ctx.effect(() => () => driver.dispose());
		driver.resumeActive();
		ctx.commands.register(defineWorkflowCommand({ service, operator }));
		ctx.tools.register(defineInternetWorkflowTool(service, { browser: manager }));
		ctx.tools.register(defineInternetWorkflowMaintenanceTool(retention));
		ctx.systemPrompt?.section?.({ name: "tool:internet_workflow", order: 123, text: INTERNET_WORKFLOW_GUIDANCE });
	}
}

export { BrowserManager } from "#internet/browser/runtime";
export {
	WebsiteParticipantArtifactStore,
	WebsiteParticipantArtifactStoreError,
	parseWebsiteParticipantArtifact,
} from "#internet/participant/artifact-store";
export type {
	CreateWebsiteParticipantArtifactInput,
	WebsiteParticipantArtifact,
	WebsiteParticipantMode,
	WebsiteParticipantTextRange,
} from "#internet/participant/artifact-store";
export {
	DEFAULT_WEBSITE_RESULT_INLINE_CHARS,
	projectWebsiteParticipantResult,
	WebsiteParticipantService,
} from "#internet/participant/service";
export type {
	WebsiteParticipantProjection,
	WebsiteParticipantRequest,
	WebsiteParticipantResult,
} from "#internet/participant/service";
export {
	hashProviderTurnText,
	ProviderTurnReceiptStore,
	parseProviderTurnReceipt,
	providerTurnReceiptId,
	reconcileProviderTurn,
} from "#internet/browser/turn-receipts";
export type { AccountCapability, AccountDefinition, AccountId, AccountRole } from "#internet/core/accounts";
export {
	ACCOUNT_CAPABILITIES,
	ACCOUNT_IDS,
	ACCOUNT_ROLES,
	ACCOUNTS,
	accountHasCapability,
	accountsForProvider,
	accountsWithCapabilities,
	DEFAULT_TEAM_ACCOUNTS,
	DEFAULT_TEAM_SYNTHESIZER,
	getAccountDefinition,
	isAccountId,
} from "#internet/core/accounts";
export type { BrowserConfig, ChatGptThinkingLevel, WebProvider } from "#internet/core/config";
export { CHATGPT_THINKING_LEVELS, Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export { runTeamStep } from "#internet/team/executor";
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
export { canonicalAdmissionJson, hashAdmissionValue } from "#internet/workflow/admission/hash";
export { preflightWorkflowAdmission } from "#internet/workflow/admission/preflight";
export type { WorkflowAdmissionLifecycleOptions } from "#internet/workflow/admission/service";
export { WorkflowAdmissionService, WorkflowAdmissionServiceError } from "#internet/workflow/admission/service";
export { WorkflowAdmissionStore, WorkflowAdmissionStoreError } from "#internet/workflow/admission/store";
export type {
	AcceptedAdmissionSpec,
	AdmissionActivationReceipt,
	AdmissionConfirmationInput,
	AdmissionConfirmationReason,
	AdmissionConfirmationReceipt,
	AdmissionPreview,
	ProvenancedValue,
	WorkflowAdmissionAuthority,
	WorkflowAdmissionBudgetHints,
	WorkflowAdmissionConfirmationLevel,
	WorkflowAdmissionDraft,
	WorkflowAdmissionDraftInput,
	WorkflowAdmissionProvenance,
	WorkflowAdmissionRecord,
	WorkflowAdmissionSource,
	WorkflowAdmissionSourceKind,
	WorkflowAdmissionState,
	WorkflowAdmissionTarget,
	WorkflowAdmissionTemporalHints,
} from "#internet/workflow/admission/types";
export {
	WORKFLOW_ADMISSION_CONFIRMATION_LEVELS,
	WORKFLOW_ADMISSION_PROVENANCE,
	WORKFLOW_ADMISSION_SOURCE_KINDS,
	WORKFLOW_ADMISSION_STATES,
} from "#internet/workflow/admission/types";
export { parseWorkflowAdmissionDraft, parseWorkflowAdmissionRecord } from "#internet/workflow/admission/validation";
export type { CreateWorkflowArtifactInput } from "#internet/workflow/artifact-store";
export { WorkflowArtifactStore, WorkflowArtifactStoreError } from "#internet/workflow/artifact-store";
export type {
	WorkflowAuthorizationContext,
	WorkflowPrincipal,
	WorkflowPrincipalKind,
} from "#internet/workflow/authorization";
export { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
export type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
export { WorkflowCapabilityRegistry, WorkflowCapabilityRegistryError } from "#internet/workflow/capability-registry";
export type { WorkflowControlKind, WorkflowControlMessage } from "#internet/workflow/control";
export { createWorkflowControlMessage, WORKFLOW_CONTROL_KINDS } from "#internet/workflow/control";
export type { WorkflowDriverEngine } from "#internet/workflow/driver";
export { WorkflowDriver } from "#internet/workflow/driver";
export { WorkflowEngine } from "#internet/workflow/engine";
export type {
	WorkflowAgentRegistry,
	WorkflowEventSink,
	WorkflowGraphEvent,
	WorkflowLocalAgent,
} from "#internet/workflow/events";
export {
	DshWorkflowEventSink,
	formatWorkflowEvent,
	parseWorkflowGraphEvent,
	WorkflowEventJournal,
} from "#internet/workflow/events";
export type {
	WorkflowExecutionRecord,
	WorkflowFailure,
	WorkflowGraphNode,
	WorkflowGraphSnapshot,
	WorkflowLifecycle,
	WorkflowNodeState,
	WorkflowPhase,
} from "#internet/workflow/graph";
export { assertWorkflowGraph, workflowNodeId } from "#internet/workflow/graph";
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
export type { CreateWorkflowInputBundleInput } from "#internet/workflow/input-bundle-store";
export { WorkflowInputBundleStore, WorkflowInputBundleStoreError } from "#internet/workflow/input-bundle-store";
export * from "#internet/workflow/interactions/index";
export { WorkflowDurablePendingActionRuntime } from "#internet/workflow/interactions/runtime";
export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";
export * from "#internet/workflow/kernel/index";
export type { WorkflowNodeResult } from "#internet/workflow/node-result-store";
export {
	parseWorkflowNodeResult,
	WorkflowNodeResultStore,
	workflowNodeResultId,
} from "#internet/workflow/node-result-store";
export {
	formatWorkflowList,
	formatWorkflowStatus,
	WorkflowOperator,
	WorkflowOperatorError,
} from "#internet/workflow/operator";
export { WorkflowPendingActionStore, WorkflowPendingActionStoreError } from "#internet/workflow/pending-action-store";
export {
	WorkflowPlanningCapabilityAdapter,
	WorkflowTeamPlanningExecutor,
} from "#internet/workflow/profiles/common/planning-capability";
export { WorkflowProfileRegistry, WorkflowProfileRegistryError } from "#internet/workflow/profiles/registry";
export {
	EXTERNAL_DEEP_RESEARCH_CAPABILITY,
	WorkflowExternalDeepResearchAdapter,
} from "#internet/workflow/profiles/research/deep-research-capability";
export {
	SOFTWARE_IMPLEMENTATION_CAPABILITY,
	WorkflowSoftwareImplementationAdapter,
	type WorkflowSoftwareWriterRequestProjector,
} from "#internet/workflow/profiles/software/implementation-capability";
export {
	SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY,
	WorkflowSoftwareRepositoryResearchAdapter,
} from "#internet/workflow/profiles/software/research-capability";
export {
	SOFTWARE_REVIEW_CAPABILITY,
	WorkflowSoftwareReviewAdapter,
} from "#internet/workflow/profiles/software/review-capability";
export { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
export { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
export type { WorkflowProfileAdmissionResult, WorkflowProfileDescriptor } from "#internet/workflow/profiles/types";
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
export { WorkflowRunStore, WorkflowRunStoreError } from "#internet/workflow/run-store";
export * from "#internet/workflow/runtime/index";
export * from "#internet/workflow/semantic/index";
export type { WorkflowServiceDriver, WorkflowServiceEngine } from "#internet/workflow/service";
export { WorkflowService, WorkflowServiceError } from "#internet/workflow/service";
export type {
	WorkflowPromptContext,
	WorkflowReviewPromptContext,
	WorkflowTeamLane,
	WorkflowTeamPhase,
} from "#internet/workflow/team-prompt-builder";
export { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
export type { WorkflowTeamRunner, WorkflowTeamStepRequest } from "#internet/workflow/team-runner";
export { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
export type {
	StartWorkflowInput,
	WorkflowAccountRouting,
	WorkflowEventRecord,
	WorkflowHandoffReceipt,
	WorkflowJob,
	WorkflowPendingAction,
	WorkflowPullRequestReceipt,
	WorkflowWriterConversation,
} from "#internet/workflow/types";
export { workflowJobIsTerminal } from "#internet/workflow/types";
export { WorkflowWorkItemStore, WorkflowWorkItemStoreError } from "#internet/workflow/work-item-store";
export type {
	WorkflowWriterControlRequest,
	WorkflowWriterDeliveryRequest,
	WorkflowWriterResult,
	WorkflowWriterRunner,
} from "#internet/workflow/writer-runner";
export { BrowserWorkflowWriterRunner, parseWorkflowWriterResult } from "#internet/workflow/writer-runner";
