import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";
/**
 * Define the `internet_chat` model tool: ask ChatGPT Web or Gemini Web a
 * question through a real logged-in browser and return the rendered answer as
 * markdown. This is the MVP entry point that DSH agents call; a provider-model
 * adapter on `ctx.llm` can be layered on later reusing the same
 * {@link BrowserManager}.
 */
export declare function defineBrowserChatTool(manager: BrowserManager, timeoutMs: number, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=browser-chat.d.ts.map