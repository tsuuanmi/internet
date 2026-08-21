import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { defineTool } from "@deepseek-ai/dsh-tools";
import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";
import { defineInternetBrowserTool } from "#internet/tools/browser";
import { defineBrowserChatTool } from "#internet/tools/browser-chat";

/** Cordis plugin name used by loader diagnostics. */
export const name = "internet";

/** Services required by this plugin. */
export const inject = ["tools", "systemPrompt", "commands"] as const;

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
	ctx.systemPrompt?.section?.({
		name: "tool:browser_chat",
		order: 120,
		text: "Use browser_chat to get a ChatGPT or Gemini answer. ChatGPT calls from one DSH session durably resume the same native conversation, so use later calls as follow-up turns. If a provider is not signed in, run internet_browser login, tell the user to sign in and close the dedicated normal Chrome window completely, then retry after verified state is exported.",
	});
}

export { BrowserManager } from "#internet/browser/runtime";
export type { BrowserConfig, WebProvider } from "#internet/core/config";
export { Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export { parseChatArgs } from "#internet/tools/args";
