import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId, getAccountDefinition } from "#internet/core/accounts";
import type { WebsiteParticipantArtifactStore, WebsiteParticipantMode } from "#internet/participant/artifact-store";
export declare const DEFAULT_WEBSITE_RESULT_INLINE_CHARS = 12000;
export interface WebsiteParticipantRequest {
    readonly ownerSessionId: string;
    readonly conversationSessionId?: string;
    readonly accountId: AccountId;
    readonly logicalRequestId: string;
    readonly mode: WebsiteParticipantMode;
    readonly prompt: string;
    readonly visible?: boolean;
    readonly signal?: AbortSignal;
}
export interface WebsiteParticipantResult {
    readonly accountId: AccountId;
    readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly mode: WebsiteParticipantMode;
    readonly text: string;
    readonly url: string;
    readonly conversationId?: string;
    readonly artifactId: string;
    readonly totalChars: number;
}
export interface WebsiteParticipantProjection {
    readonly text: string;
    readonly artifactId: string;
    readonly totalChars: number;
    readonly truncated: boolean;
    readonly nextOffset?: number;
}
type ParticipantBrowser = Pick<BrowserManager, "chat" | "research">;
export declare class WebsiteParticipantService {
    private readonly browser;
    private readonly artifacts;
    constructor(browser: ParticipantBrowser, artifacts: WebsiteParticipantArtifactStore);
    execute(request: WebsiteParticipantRequest): Promise<WebsiteParticipantResult>;
}
export declare function projectWebsiteParticipantResult(result: WebsiteParticipantResult, inlineMaxChars?: number): WebsiteParticipantProjection;
export {};
//# sourceMappingURL=service.d.ts.map