import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
export type InternetBrowserAction = "login" | "status" | "stop" | "login_all" | "status_all" | "stop_all";
/** Define the `internet_browser` lifecycle tool, including batch account bootstrap/status/stop. */
export declare function defineInternetBrowserTool(manager: Pick<BrowserManager, "login" | "status" | "stop">, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-browser.d.ts.map