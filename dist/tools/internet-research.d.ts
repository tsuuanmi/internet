import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
import type { BrowserConfig } from "#internet/core/config";
/** Run provider-native Deep Research with isolated durable account conversations. */
export declare function defineInternetResearchTool(manager: Pick<BrowserManager, "research">, config: BrowserConfig, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-research.d.ts.map