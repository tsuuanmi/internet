import { type AccountId, getAccountDefinition } from "#internet/core/accounts";
export declare const WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA: "@tsuuanmi/internet-website-participant-artifact";
export type WebsiteParticipantMode = "chat" | "research";
export interface WebsiteParticipantArtifact {
    readonly schema: typeof WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA;
    readonly version: 1;
    readonly artifactId: string;
    readonly ownerSessionHash: string;
    readonly accountId: AccountId;
    readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
    readonly logicalRequestIdHash: string;
    readonly mode: WebsiteParticipantMode;
    readonly promptHash: string;
    readonly text: string;
    readonly textHash: string;
    readonly url: string;
    readonly conversationId?: string;
    readonly createdAt: string;
}
export interface CreateWebsiteParticipantArtifactInput {
    readonly ownerSessionId: string;
    readonly accountId: AccountId;
    readonly logicalRequestId: string;
    readonly mode: WebsiteParticipantMode;
    readonly prompt: string;
    readonly text: string;
    readonly url: string;
    readonly conversationId?: string;
}
export interface WebsiteParticipantTextRange {
    readonly text: string;
    readonly offset: number;
    readonly totalChars: number;
    readonly nextOffset?: number;
}
export declare class WebsiteParticipantArtifactStoreError extends Error {
    constructor(message: string);
}
export declare function parseWebsiteParticipantArtifact(value: unknown): WebsiteParticipantArtifact;
export declare class WebsiteParticipantArtifactStore {
    private readonly root;
    constructor(dataDir: string);
    create(input: CreateWebsiteParticipantArtifactInput): WebsiteParticipantArtifact;
    readForRequest(ownerSessionId: string, accountId: AccountId, logicalRequestId: string, mode: WebsiteParticipantMode): WebsiteParticipantArtifact | undefined;
    read(ownerSessionId: string, artifactId: string): WebsiteParticipantArtifact | undefined;
    readText(ownerSessionId: string, artifactId: string, options: {
        readonly offset: number;
        readonly maxChars: number;
    }): WebsiteParticipantTextRange;
    private path;
}
//# sourceMappingURL=artifact-store.d.ts.map