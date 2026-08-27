import type { BrowserConfig, WebProvider } from "#internet/core/config";
export interface ChatRequest {
    prompt: string;
    /** Durable owner key: the current DSH agent/session ID. */
    sessionId: string;
    signal?: AbortSignal;
}
export interface ChatResult {
    text: string;
    url: string;
    conversationId?: string;
}
export interface ProviderStatus {
    provider: WebProvider;
    loggedIn: boolean;
    storageStatePath: string;
}
/**
 * Owns isolated browser sessions. Interactive login runs in a dedicated,
 * per-provider normal Chrome profile (without browser-automation flags). The
 * profile is retained so reopening login visibly shows the same signed-in account.
 * After the user closes Chrome, patchright reads the unlocked profile and manually
 * exports and verifies storage state; inference still uses a fresh non-persistent
 * context. Waiting for the profile lock avoids Chrome singleton conflicts.
 */
export declare class BrowserManager {
    private readonly config;
    private readonly configuredChromePath;
    private resolvedChromePath;
    private readonly sessions;
    private readonly chatGptConversations;
    private readonly geminiConversations;
    private readonly pendingCloses;
    private readonly providerOperations;
    private readonly display;
    private disposed;
    constructor(config: BrowserConfig);
    private chromeExecutable;
    private locations;
    private serializeProvider;
    private storageStateExists;
    private writePrivateJson;
    private homeUrl;
    private activePage;
    private isAuthenticated;
    private waitForChatGptConversationUrl;
    private waitForGeminiConversationUrl;
    private waitForAuthenticatedPage;
    private clearProfileSingleton;
    private profileOwnerPid;
    private processIsAlive;
    private waitForProfileUnlock;
    private launchNormalLogin;
    private exportContextState;
    private captureLoginState;
    private inferenceArgs;
    private verifyStorageState;
    private closeSession;
    private closeVirtualDisplaySessions;
    /** Cancel any pending delayed-close timer for a provider (the browser is needed now). */
    private cancelPendingClose;
    /**
     * Schedule closing a provider's browser after `closeAfterMs`, cancelling any
     * prior pending close. Gemini keeps its browser open: its session and
     * conversations live in IndexedDB, which is not persisted across a browser
     * restart, so closing it would drop the login and durable conversation.
     */
    private scheduleClose;
    private ensureContext;
    /** Open normal Chrome for sign-in; export its profile after the user closes it. */
    login(provider: WebProvider): Promise<ProviderStatus>;
    private loginProvider;
    /** Report whether a provider has an exported, verified login state. */
    status(provider: WebProvider): Promise<ProviderStatus>;
    /** Run one browser chat turn against the provider and return rendered markdown. */
    chat(provider: WebProvider, request: ChatRequest): Promise<ChatResult>;
    private chatProvider;
    /** Close the provider's managed inference browser, if one is open. */
    stop(provider: WebProvider): Promise<void>;
    private stopProvider;
    /** Close every managed inference browser (no leaked Chrome processes). */
    dispose(): Promise<void>;
}
//# sourceMappingURL=runtime.d.ts.map