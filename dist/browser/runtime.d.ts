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
 * Owns isolated browser sessions. Interactive login runs in a separately
 * spawned normal Chrome profile (without Playwright automation flags). After
 * the user closes Chrome, Playwright reads the unlocked profile, manually
 * exports and verifies storage state, removes the temporary profile, and
 * inference creates a fresh non-persistent context. This avoids OAuth failures and
 * Chrome profile singleton locks.
 */
export declare class BrowserManager {
    private readonly config;
    private readonly configuredChromePath;
    private resolvedChromePath;
    private readonly sessions;
    private readonly chatGptConversations;
    private readonly geminiConversations;
    private readonly pendingCloses;
    constructor(config: BrowserConfig);
    private chromeExecutable;
    private locations;
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
    /** Cancel any pending delayed-close timer for a provider (the browser is needed now). */
    private cancelPendingClose;
    /** Schedule closing a provider's browser after `closeAfterMs`, cancelling any prior pending close. */
    private scheduleClose;
    private ensureContext;
    /** Open normal Chrome for sign-in; export its profile after the user closes it. */
    login(provider: WebProvider): Promise<ProviderStatus>;
    /** Report whether a provider has an exported, verified login state. */
    status(provider: WebProvider): Promise<ProviderStatus>;
    /** Run one browser chat turn against the provider and return rendered markdown. */
    chat(provider: WebProvider, request: ChatRequest): Promise<ChatResult>;
    /** Close the provider's managed inference browser, if one is open. */
    stop(provider: WebProvider): Promise<void>;
    /** Close every managed inference browser (no leaked Chrome processes). */
    dispose(): Promise<void>;
}
//# sourceMappingURL=runtime.d.ts.map