import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";
/** Define the `internet_chat` model tool over explicitly selected thinker accounts. */
export declare function defineInternetChatTool(manager: BrowserManager, timeoutMs: number, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-chat.d.ts.map