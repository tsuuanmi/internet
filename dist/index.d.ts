import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
import { type WorkflowAgentRegistry } from "#internet/workflow/events";
export declare const name = "internet";
export declare const inject: readonly ["tools", "systemPrompt", "commands", "agents"];
export interface PluginContext {
    agents: WorkflowAgentRegistry;
    tools: {
        register(tool: ReturnType<typeof defineTool>): void;
    };
    commands: {
        register(command: CommandDefinition): void;
    };
    systemPrompt?: {
        section(options: {
            name: string;
            order: number;
            text: string;
        }): void;
    };
    effect(fn: () => (() => void | Promise<void>) | void): void;
}
export declare function apply(ctx: PluginContext, rawConfig: unknown): void;
export { BrowserManager } from "#internet/browser/runtime";
export type { AccountCapability, AccountDefinition, AccountId, AccountRole } from "#internet/core/accounts";
export { ACCOUNT_CAPABILITIES, ACCOUNT_IDS, ACCOUNT_ROLES, ACCOUNTS, accountHasCapability, accountsForProvider, accountsWithCapabilities, getAccountDefinition, isAccountId, } from "#internet/core/accounts";
export type { BrowserConfig, ChatGptThinkingLevel, WebProvider } from "#internet/core/config";
export { CHATGPT_THINKING_LEVELS, Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export type { OtherContribution, TeamFailure, TeamOptions, TeamResult, TeamSuccess, TeamTurn, } from "#internet/team/orchestrator";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export type { ChatInput, ResearchInput, TeamInput } from "#internet/tools/args";
export { parseChatArgs, parseResearchArgs, parseTeamArgs } from "#internet/tools/args";
export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";
export type { WorkflowControlKind, WorkflowControlMessage } from "#internet/workflow/control";
export { createWorkflowControlMessage, WORKFLOW_CONTROL_KINDS } from "#internet/workflow/control";
export type { WorkflowDriverEngine } from "#internet/workflow/driver";
export { WorkflowDriver } from "#internet/workflow/driver";
export type { WorkflowControlStep } from "#internet/workflow/engine";
export { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";
export type { WorkflowAgentRegistry, WorkflowEventSink, WorkflowLocalAgent } from "#internet/workflow/events";
export { DshWorkflowEventSink, formatWorkflowEvent } from "#internet/workflow/events";
export type { CreateWorkflowHandoffInput, WorkflowHandoff, WorkflowHandoffStatus, } from "#internet/workflow/handoff-store";
export { HANDOFF_SCHEMA, hashHandoffPayload, parseWorkflowHandoff, WorkflowHandoffStore, WorkflowHandoffStoreError, } from "#internet/workflow/handoff-store";
export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";
export type { WorkflowReviewResult, WorkflowReviewVerdict } from "#internet/workflow/review-result";
export { parseWorkflowReviewResult, WORKFLOW_REVIEW_VERDICTS } from "#internet/workflow/review-result";
export type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
export { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
export type { WorkflowTeamRunner, WorkflowTeamRunRequest, WorkflowTeamRunResult } from "#internet/workflow/team-runner";
export { BrowserWorkflowTeamRunner } from "#internet/workflow/team-runner";
export type { StartWorkflowInput, WorkflowAccountRouting, WorkflowDecisionInput, WorkflowEventRecord, WorkflowHandoffReceipt, WorkflowJob, WorkflowPendingAction, WorkflowPullRequestReceipt, WorkflowState, WorkflowTeamResult, WorkflowTeamRun, WorkflowTeamStatus, } from "#internet/workflow/types";
export { TERMINAL_WORKFLOW_STATES, WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES } from "#internet/workflow/types";
export type { WorkflowWriterControlRequest, WorkflowWriterDeliveryRequest, WorkflowWriterResult, WorkflowWriterRunner, } from "#internet/workflow/writer-runner";
export { BrowserWorkflowWriterRunner, parseWorkflowWriterResult } from "#internet/workflow/writer-runner";
//# sourceMappingURL=index.d.ts.map