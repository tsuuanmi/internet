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
/**
 * Register the browser-backed web tools. The {@link BrowserManager} is created
 * lazily (Chrome is only discovered on first use) and disposed through a
 * Cordis effect so no browser process outlives the plugin.
 */
export declare function apply(ctx: PluginContext, rawConfig: unknown): void;
export { BrowserManager } from "#internet/browser/runtime";
export type { BrowserConfig, WebProvider } from "#internet/core/config";
export { Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export { parseChatArgs } from "#internet/tools/args";
//# sourceMappingURL=index.d.ts.map