import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { defineWorkflowCommand } from "#internet/commands/workflow";
import { ACCOUNT_IDS, getAccountDefinition } from "#internet/core/accounts";
import { resolveBrowserConfig } from "#internet/core/config";
import { defineInternetBrowserTool } from "#internet/tools/internet-browser";
import { defineInternetChatTool } from "#internet/tools/internet-chat";
import { defineInternetResearchTool } from "#internet/tools/internet-research";
import { defineInternetTeamTool } from "#internet/tools/internet-team";
import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";
import { WorkflowDriver } from "#internet/workflow/driver";
import { WorkflowEngine } from "#internet/workflow/engine";
import { DshWorkflowEventSink } from "#internet/workflow/events";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
import { BrowserWorkflowWriterRunner } from "#internet/workflow/writer-runner";
export const name = "internet";
export const inject = ["tools", "systemPrompt", "commands", "agents"];
const INTERNET_CHAT_GUIDANCE = [
    "Use internet_chat for one answer or a durable multi-turn exchange through an explicitly selected thinker account: chatgpt-thinker or gemini-thinker.",
    "Each account resumes one native conversation for the current DSH session. The automated browser is hidden by default on the managed display; set visible: true only when the user asks to watch or when live UI inspection is needed.",
    "ChatGPT selects and verifies the configured reasoning level before every turn (High by default). Gemini selects and verifies the observed latest Flash model with Extended thinking before every ordinary turn; provider-native Deep Research uses its own mode.",
    "If an account is missing or requires reauthentication, use internet_browser status and then login with that exact account ID. chatgpt-thinker and chatgpt-writer have separate login state and must never share credentials or browser storage.",
    "internet_chat cannot read local files or search the web by itself. Paste required material into the prompt and gather current sources with web_search or web_fetch first.",
].join(" ");
const INTERNET_RESEARCH_GUIDANCE = "Use internet_research for provider-native Deep Research rather than ordinary internet_chat when the user needs a sourced, long-running investigation. It runs through explicitly selected thinker accounts, isolates durable conversations per account under a research name, and may return partial success when only one account completes.";
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
    "Use internet_workflow as the deterministic control-plane surface for durable coding jobs. /workflow <task> is the normal user entry point: it resolves the current Git repository and exact revision, creates the durable job, and immediately enqueues deterministic background execution.",
    "WorkflowDriver advances runnable engine states automatically through research, exact handoffs, writer implementation, PR review/remediation, and the explicit merge-authorization boundary. It is code-owned orchestration, not another LLM layer. Safe in-flight states are rediscovered after plugin restart; action-required and rejected-merge states remain stopped until explicit user/operator action.",
    "Workflow state, account routing, team lane identities, writer conversation identity, handoff receipts, PR receipt, review cycle, pending action, and compact last event are persisted outside model context.",
    "Workflow-owned team execution calls the lower-level team runtime directly with deterministic prompts and per-job lanes; no free-form child agent is needed merely to call internet_team.",
    "Research finals are materialized as exact SHA-256-bound durable handoffs. Data-plane payloads are separate from trusted control messages, and START_IMPLEMENTATION is gated on delivery of both research handoffs.",
    "The workflow writer is the separate chatgpt-writer account. It receives both research finals verbatim in one persistent per-job conversation, then a separate trusted START_IMPLEMENTATION control. The writer must open/update one PR and return a compact machine-validated PR receipt; merge is never part of this phase.",
    "Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope; merge remains excluded until a reviewed PR also has an exact-head PR-health receipt. CHECK_PR_HEALTH is read-only and classifies the authoritative PR head as PASS, FAIL, PENDING, NONE, or UNKNOWN; only PASS/NONE may reach request_merge. request_merge emits a concrete ACTION_REQUIRED request, approve binds repository + PR + branch + exact head SHA, and MERGING re-checks the same head's health immediately before MERGE_AUTHORIZED. A moved head or non-eligible health invalidates authorization instead of guessing. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",
].join(" ");
function enabledAccounts(config) {
    return new Set(ACCOUNT_IDS.filter((accountId) => {
        const provider = getAccountDefinition(accountId).provider;
        return provider === "chatgpt-web" ? config.enableChatgpt : config.enableGemini;
    }));
}
export function apply(ctx, rawConfig) {
    const config = resolveBrowserConfig(rawConfig);
    const manager = new BrowserManager(config);
    ctx.effect(() => () => manager.dispose());
    const accounts = enabledAccounts(config);
    if (accounts.size === 0)
        return;
    const thinkers = new Set([...accounts].filter((accountId) => getAccountDefinition(accountId).role === "thinker"));
    if (accounts.has("chatgpt-thinker"))
        ctx.commands.register(defineInternetCommand(manager));
    ctx.tools.register(defineInternetBrowserTool(manager, accounts));
    if (thinkers.size > 0) {
        ctx.tools.register(defineInternetChatTool(manager, config.turnTimeoutMs, thinkers));
        ctx.tools.register(defineInternetResearchTool(manager, config, thinkers));
        ctx.systemPrompt?.section?.({ name: "tool:internet_research", order: 119, text: INTERNET_RESEARCH_GUIDANCE });
        ctx.systemPrompt?.section?.({ name: "tool:internet_chat", order: 120, text: INTERNET_CHAT_GUIDANCE });
    }
    if (thinkers.has("chatgpt-thinker") && thinkers.has("gemini-thinker") && accounts.has("chatgpt-writer")) {
        const workflowJobs = new WorkflowJobStore(config.dataDir);
        const workflowEngine = new WorkflowEngine(workflowJobs, new BrowserWorkflowTeamRunner(manager, config), new WorkflowTeamPromptBuilder(), new WorkflowHandoffStore(config.dataDir), new BrowserWorkflowWriterRunner(manager), 3, new DshWorkflowEventSink(ctx.agents));
        const workflowDriver = new WorkflowDriver(workflowEngine, workflowJobs);
        ctx.effect(() => () => workflowDriver.dispose());
        workflowDriver.resumeActive();
        ctx.commands.register(defineWorkflowCommand({ engine: workflowEngine, driver: workflowDriver }));
        ctx.tools.register(defineInternetWorkflowTool(workflowEngine, workflowDriver));
        ctx.tools.register(defineInternetTeamTool(manager, config, thinkers));
        ctx.systemPrompt?.section?.({ name: "tool:internet_workflow", order: 121, text: INTERNET_WORKFLOW_GUIDANCE });
        ctx.systemPrompt?.section?.({ name: "tool:internet_team", order: 122, text: INTERNET_TEAM_GUIDANCE });
    }
}
export { BrowserManager } from "#internet/browser/runtime";
export { ACCOUNT_CAPABILITIES, ACCOUNT_IDS, ACCOUNT_ROLES, ACCOUNTS, accountHasCapability, accountsForProvider, accountsWithCapabilities, getAccountDefinition, isAccountId, } from "#internet/core/accounts";
export { CHATGPT_THINKING_LEVELS, Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export { parseChatArgs, parseResearchArgs, parseTeamArgs } from "#internet/tools/args";
export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";
export { createWorkflowControlMessage, WORKFLOW_CONTROL_KINDS } from "#internet/workflow/control";
export { WorkflowDriver } from "#internet/workflow/driver";
export { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";
export { DshWorkflowEventSink, formatWorkflowEvent } from "#internet/workflow/events";
export { HANDOFF_SCHEMA, hashHandoffPayload, parseWorkflowHandoff, WorkflowHandoffStore, WorkflowHandoffStoreError, } from "#internet/workflow/handoff-store";
export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";
export { parseWorkflowReviewResult, WORKFLOW_REVIEW_VERDICTS } from "#internet/workflow/review-result";
export { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
export { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
export { TERMINAL_WORKFLOW_STATES, WORKFLOW_PR_HEALTH_STATUSES, WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES, } from "#internet/workflow/types";
export { BrowserWorkflowWriterRunner, parseWorkflowWriterResult } from "#internet/workflow/writer-runner";
//# sourceMappingURL=index.js.map