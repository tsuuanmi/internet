import * as acp from "@agentclientprotocol/sdk";
import type { InternetChatApplicationService, InternetResearchApplicationService } from "#internet/application";
import type { AccountId } from "#internet/core/accounts";
export interface InternetAcpAgentOptions {
    readonly chat: Pick<InternetChatApplicationService, "execute">;
    readonly research: Pick<InternetResearchApplicationService, "execute">;
    readonly chatAccountId: AccountId;
    readonly researchAccountIds: readonly AccountId[];
}
export declare function createInternetAcpAgent(options: InternetAcpAgentOptions): acp.AgentApp;
//# sourceMappingURL=agent.d.ts.map