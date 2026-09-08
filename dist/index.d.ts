import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "internet";
/** Services required by this plugin. */
export declare const inject: readonly ["tools", "systemPrompt", "commands"];
/** Minimal context surface this plugin uses; injected services are real DSH objects at runtime. */
export interface PluginContext {
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
/** Register browser-backed tools over explicit semantic account identities. */
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
//# sourceMappingURL=index.d.ts.map