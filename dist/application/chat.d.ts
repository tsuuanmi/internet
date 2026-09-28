import { type InternetApplicationRequestContext } from "#internet/application/context";
import { type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { type WebsiteParticipantService } from "#internet/participant/service";
export interface InternetChatInput {
    readonly accountId: AccountId;
    readonly prompt: string;
    readonly visible?: boolean;
}
export interface InternetChatApplicationResult {
    readonly answer: string;
    readonly accountId: AccountId;
    readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly url?: string;
    readonly conversationId?: string;
    readonly artifactId?: string;
    readonly totalChars?: number;
    readonly truncated?: boolean;
    readonly nextOffset?: number;
    readonly isError?: boolean;
}
export declare class InternetChatApplicationService {
    private readonly participant;
    private readonly allowed;
    constructor(participant: Pick<WebsiteParticipantService, "execute">, allowed: ReadonlySet<AccountId>);
    execute(context: InternetApplicationRequestContext, input: InternetChatInput): Promise<InternetChatApplicationResult>;
}
//# sourceMappingURL=chat.d.ts.map