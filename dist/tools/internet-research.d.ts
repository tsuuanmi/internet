import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
/** Run provider-native Deep Research with isolated durable conversations. */
export declare function defineInternetResearchTool(manager: Pick<BrowserManager, "research">, config: BrowserConfig, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-research.d.ts.map