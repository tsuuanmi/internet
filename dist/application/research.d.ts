import { type InternetApplicationRequestContext } from "#internet/application/context";
import { type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { type WebsiteParticipantService } from "#internet/participant/service";
export interface InternetResearchInput {
    readonly query: string;
    readonly accountIds?: readonly AccountId[];
    readonly name?: string;
    readonly visible?: boolean;
}
export interface InternetResearchAccountResult {
    readonly accountId: AccountId;
    readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly state: "completed" | "failed";
    readonly report?: string;
    readonly url?: string;
    readonly conversationId?: string;
    readonly artifactId?: string;
    readonly totalChars?: number;
    readonly truncated?: boolean;
    readonly nextOffset?: number;
    readonly diagnostic?: string;
}
export interface InternetResearchApplicationResult {
    readonly state: "completed" | "partial_success" | "failed";
    readonly results: InternetResearchAccountResult[];
}
export declare class InternetResearchApplicationService {
    private readonly participant;
    private readonly allowed;
    constructor(participant: Pick<WebsiteParticipantService, "execute">, allowed: ReadonlySet<AccountId>);
    execute(context: InternetApplicationRequestContext, input: InternetResearchInput): Promise<InternetResearchApplicationResult>;
}
//# sourceMappingURL=research.d.ts.map