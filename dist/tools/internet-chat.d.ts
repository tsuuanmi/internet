import { defineTool } from "@deepseek-ai/dsh-tools";
import { type AccountId } from "#internet/core/accounts";
import { type WebsiteParticipantService } from "#internet/participant/service";
export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";
/** Define the `internet_chat` model tool over explicitly selected thinker accounts. */
export declare function defineInternetChatTool(participant: Pick<WebsiteParticipantService, "execute">, timeoutMs: number, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-chat.d.ts.map