import { defineTool } from "@deepseek-ai/dsh-tools";
import { type AccountId } from "#internet/core/accounts";
import type { BrowserConfig } from "#internet/core/config";
import { type WebsiteParticipantService } from "#internet/participant/service";
/** Run provider-native Deep Research with isolated durable account conversations. */
export declare function defineInternetResearchTool(participant: Pick<WebsiteParticipantService, "execute">, config: BrowserConfig, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-research.d.ts.map