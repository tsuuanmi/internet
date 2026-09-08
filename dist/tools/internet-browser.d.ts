import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
export type InternetBrowserAction = "login" | "status" | "stop";
/** Define the `internet_browser` lifecycle tool (login / status / stop) per account. */
export declare function defineInternetBrowserTool(manager: BrowserManager, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-browser.d.ts.map