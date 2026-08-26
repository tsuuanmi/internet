import { BrowserManager } from "#internet/browser/runtime";
import { defineInternetCommand } from "#internet/commands/internet";
import { resolveBrowserConfig } from "#internet/core/config";
import { defineInternetBrowserTool } from "#internet/tools/browser";
import { defineBrowserChatTool } from "#internet/tools/browser-chat";
import { defineBrowserTeamTool } from "#internet/tools/browser-team";
/** Cordis plugin name used by loader diagnostics. */
export const name = "internet";
/** Services required by this plugin. */
export const inject = ["tools", "systemPrompt", "commands"];
/**
 * Register the browser-backed web tools. The {@link BrowserManager} is created
 * lazily (Chrome is only discovered on first use) and disposed through a
 * Cordis effect so no browser process outlives the plugin.
 */
export function apply(ctx, rawConfig) {
    const config = resolveBrowserConfig(rawConfig);
    const manager = new BrowserManager(config);
    ctx.effect(() => () => manager.dispose());
    const allowed = new Set();
    if (config.enableChatgpt) {
        allowed.add("chatgpt-web");
        ctx.commands.register(defineInternetCommand(manager));
    }
    if (config.enableGemini)
        allowed.add("gemini-web");
    if (allowed.size === 0)
        return;
    ctx.tools.register(defineBrowserChatTool(manager, config.turnTimeoutMs, allowed));
    ctx.tools.register(defineInternetBrowserTool(manager, allowed));
    if (allowed.size >= 2) {
        ctx.tools.register(defineBrowserTeamTool(manager, config, allowed));
        ctx.systemPrompt?.section?.({
            name: "tool:browser_team",
            order: 121,
            text: "Use browser_team to run a multi-model debate between ordered configured web providers on a task; it returns only the final 'best of both' answer by default, or the bounded current-call transcript when `includeTranscript` is true. Prefer browser_team when the user wants a brainstorm, a design decision or tradeoff analysis, a code or document review, a second opinion, or red-teaming an idea — any case where multiple independent perspectives should be merged into one answer. browser_team cannot search the web or read files: paste any code, document, or source material into the task, and gather current information with web_search or web_fetch first. The debate runs for `rounds` rounds (default 2) and appends a final synthesis turn.",
        });
    }
    ctx.systemPrompt?.section?.({
        name: "tool:browser_chat",
        order: 120,
        text: "Use browser_chat to get a single answer from ChatGPT or Gemini through a logged-in browser. Calls from one DSH session durably resume the same native conversation per provider, so use later calls as follow-up turns in that conversation. Prefer browser_chat when you need one model's specific answer or a multi-turn back-and-forth with a single provider. If a provider is not signed in, run internet_browser login, tell the user to sign in and close the dedicated normal Chrome window completely, then retry after verified state is exported.",
    });
}
export { BrowserManager } from "#internet/browser/runtime";
export { Config, resolveBrowserConfig, WEB_PROVIDERS } from "#internet/core/config";
export { InternetError, isInternetError } from "#internet/core/errors";
export { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";
export { parseChatArgs, parseTeamArgs } from "#internet/tools/args";
//# sourceMappingURL=index.js.map