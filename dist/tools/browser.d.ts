import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
export type BrowserAction = "login" | "status" | "stop";
/** Define the `internet_browser` lifecycle tool (login / status / stop). */
export declare function defineInternetBrowserTool(manager: BrowserManager, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=browser.d.ts.map