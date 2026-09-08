import type { AccountId } from "#internet/core/accounts";
export interface ConversationBinding {
    version: 2;
    accountId: AccountId;
    revision: number;
    sessionHash: string;
    conversationId: string;
    conversationUrl: string;
    updatedAt: string;
}
/** Parse and canonicalize one native ChatGPT conversation URL. */
export declare function parseChatGptConversationUrl(value: string): {
    id: string;
    url: string;
};
/** Parse and canonicalize one native Gemini conversation URL. */
export declare function parseGeminiConversationUrl(value: string): {
    id: string;
    url: string;
};
/** Durable private 1:1 bindings from DSH session IDs to one authenticated account's native conversations. */
export declare class ConversationStore {
    private readonly root;
    private readonly parseUrl;
    private readonly accountId;
    constructor(dataDir: string, accountId: AccountId);
    read(sessionId: string): ConversationBinding | undefined;
    /** Create the session binding, or refresh its timestamp without allowing rebinding. */
    bind(sessionId: string, conversationUrl: string): ConversationBinding;
    private path;
    private validateBinding;
}
//# sourceMappingURL=conversations.d.ts.map