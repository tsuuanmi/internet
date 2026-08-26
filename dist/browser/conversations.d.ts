export interface ConversationBinding {
    version: 1;
    revision: number;
    sessionHash: string;
    conversationId: string;
    conversationUrl: string;
    updatedAt: string;
}
export type ChatGptConversationBinding = ConversationBinding;
export type GeminiConversationBinding = ConversationBinding;
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
type ConversationUrlParser = (value: string) => {
    id: string;
    url: string;
};
/**
 * Durable private 1:1 bindings from DSH session IDs to a provider's native
 * conversations. Shared by the ChatGPT and Gemini stores; each provider owns a
 * private subdirectory and its own URL parser.
 */
declare class ConversationStore {
    private readonly root;
    private readonly parseUrl;
    private readonly providerName;
    constructor(dataDir: string, providerDir: string, providerName: string, parseUrl: ConversationUrlParser);
    read(sessionId: string): ConversationBinding | undefined;
    /** Create the session binding, or refresh its timestamp without allowing rebinding. */
    bind(sessionId: string, conversationUrl: string): ConversationBinding;
    private path;
    private validateBinding;
}
/** Durable private 1:1 bindings from DSH session IDs to ChatGPT conversations. */
export declare class ChatGptConversationStore extends ConversationStore {
    constructor(dataDir: string);
}
/** Durable private 1:1 bindings from DSH session IDs to Gemini conversations. */
export declare class GeminiConversationStore extends ConversationStore {
    constructor(dataDir: string);
}
export {};
//# sourceMappingURL=conversations.d.ts.map