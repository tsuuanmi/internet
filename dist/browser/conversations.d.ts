export interface ChatGptConversationBinding {
    version: 1;
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
/** Durable private 1:1 bindings from DSH session IDs to ChatGPT conversations. */
export declare class ChatGptConversationStore {
    private readonly root;
    constructor(dataDir: string);
    read(sessionId: string): ChatGptConversationBinding | undefined;
    /** Create the session binding, or refresh its timestamp without allowing rebinding. */
    bind(sessionId: string, conversationUrl: string): ChatGptConversationBinding;
    private path;
}
//# sourceMappingURL=conversations.d.ts.map