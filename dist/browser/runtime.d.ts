import { type AccountState, type ReauthDiagnostic } from "#internet/browser/accounts";
import { type RemoteLoginStatus } from "#internet/browser/remote-login";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
export interface ChatRequest {
    prompt: string;
    /** Durable owner key: the current DSH agent/session ID. */
    sessionId: string;
    /** Show automated Chrome on the user-managed display instead of managed Xvfb. */
    visible?: boolean;
    signal?: AbortSignal;
}
export interface ChatResult {
    text: string;
    url: string;
    conversationId?: string;
}
export interface LoginOptions {
    remote?: boolean;
}
export interface ProviderStatus {
    provider: WebProvider;
    state: AccountState;
    accountPath: string;
    account?: {
        verifiedAt: string;
        revision: number;
        reauthDiagnostic?: ReauthDiagnostic;
    };
    remoteLogin?: RemoteLoginStatus;
}
/**
 * Owns isolated browser sessions. Interactive login runs in a dedicated,
 * per-provider normal Chrome profile (without browser-automation flags). The
 * profile is retained so reopening login visibly shows the same signed-in account.
 * After Chrome closes, patchright verifies bootstrap profile state in a fresh
 * context and writes the canonical portable account file, including IndexedDB.
 * Inference uses only that account file in non-persistent contexts.
 */
export declare class BrowserManager {
    private readonly config;
    private readonly configuredChromePath;
    private resolvedChromePath;
    private readonly browsers;
    private readonly browserLaunches;
    private readonly schedulers;
    private readonly remoteLogins;
    private readonly accounts;
    private readonly chatGptConversations;
    private readonly geminiConversations;
    private readonly pendingCloses;
    private readonly activeContexts;
    private readonly accountCommitQueues;
    private readonly display;
    private disposed;
    constructor(config: BrowserConfig);
    private chromeExecutable;
    private locations;
    private scheduler;
    private invalidateProvider;
    private runProviderExclusive;
    private homeUrl;
    private activePage;
    private assessAuthentication;
    private isAuthenticated;
    private waitForChatGptConversationUrl;
    private waitForGeminiConversationUrl;
    private waitForAuthenticatedPage;
    private clearProfileSingleton;
    private profileOwnerPid;
    private processIsAlive;
    private waitForProfileUnlock;
    private launchNormalLogin;
    private captureLoginState;
    private inferenceArgs;
    private verifyStorageState;
    private closeBrowser;
    private closeVirtualDisplaySessions;
    /** Cancel any pending delayed-close timer for a provider (the browser is needed now). */
    private cancelPendingClose;
    /** Schedule closing a provider browser after its scheduler becomes idle. */
    private scheduleCloseWhenIdle;
    private scheduleClose;
    private launchBrowser;
    private ensureBrowser;
    private ensureContext;
    private trackContext;
    private commitAccountSnapshot;
    /** Preserve a provider-rotated session after a recoverable failed turn. */
    private recoverAuthenticatedSnapshot;
    /**
     * Persist reauth-required only when the canonical account is still the
     * bootstrapped revision and the lease is current, then invalidate turns.
     */
    private handleSignedOut;
    /** Open local or SSH-forwarded normal Chrome for sign-in. */
    login(provider: WebProvider, options?: LoginOptions): Promise<ProviderStatus>;
    private loginProvider;
    private startRemoteLogin;
    private persistLoginProfile;
    /** Report persisted account and active remote-login state. */
    status(provider: WebProvider): Promise<ProviderStatus>;
    private providerStatus;
    /** Run one browser chat turn against the provider and return rendered markdown. */
    chat(provider: WebProvider, request: ChatRequest): Promise<ChatResult>;
    private chatProvider;
    /** Close the provider's managed inference browser, if one is open. */
    stop(provider: WebProvider): Promise<void>;
    private closeProviderResources;
    /** Close every managed inference browser (no leaked Chrome processes). */
    dispose(): Promise<void>;
}
//# sourceMappingURL=runtime.d.ts.map