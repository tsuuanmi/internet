import { defineTool } from "@deepseek-ai/dsh-tools";
import type { InternetChatApplicationService } from "#internet/application";
export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";
/** Define the DSH adapter for host-neutral `internet_chat` application behavior. */
export declare function defineInternetChatTool(application: Pick<InternetChatApplicationService, "execute">, timeoutMs: number): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-chat.d.ts.map