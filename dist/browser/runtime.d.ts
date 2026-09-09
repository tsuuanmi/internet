import { type Page } from "patchright-core";
import { type AccountState, type ReauthDiagnostic } from "#internet/browser/accounts";
import { type RemoteLoginStatus } from "#internet/browser/remote-login";
import { type AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import type { WorkflowApprovalScope } from "#internet/workflow/approval-policy";
export interface ChatRequest {
    prompt: string;
    /** Durable owner key: the current DSH agent/session ID. */
    sessionId: string;
    /** Show automated Chrome on the user-managed display instead of managed Xvfb. */
    visible?: boolean;
    /** Enables provider Deep Research before this request is submitted. */
    research?: boolean;
    /** Override the normal-turn completion deadline for a long research run. */
    timeoutMs?: number;
    /** Optional fail-closed Website confirmation policy for the workflow writer turn. */
    confirmation?: WorkflowApprovalScope;
    signal?: AbortSignal;
}
export interface ChatResult {
    text: string;
    url: string;
    conversationId?: string;
}
export interface AccountStatus {
    accountId: AccountId;
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
 * Observe immediately, discovering/persisting the native URL independently of
 * generation. Both tasks are joined on every exit; no URL poller survives a turn.
 * The completion observer must honor the supplied signal and remaining deadline.
 */
export declare function waitForBoundCompletion<T>(options: {
    provider: WebProvider;
    page: Pick<Page, "url">;
    persist: (url: string) => T;
    observe: (signal: AbortSignal, remainingMs: () => number) => Promise<string>;
    timeoutMs: number;
    signal?: AbortSignal;
}): Promise<{
    text: string;
    binding: T;
}>;
/**
 * Owns isolated browser sessions. Interactive login runs in a dedicated,
 * per-account normal Chrome profile (without browser-automation flags). The
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
    private readonly conversations;
    private readonly pendingCloses;
    private readonly activeContexts;
    private readonly accountCommitQueues;
    private readonly display;
    private disposed;
    constructor(config: BrowserConfig);
    private chromeExecutable;
    private provider;
    private locations;
    private conversationStore;
    private scheduler;
    private invalidateAccount;
    private runAccountExclusive;
    private homeUrl;
    private activePage;
    private authenticationAssessment;
    private assessAuthentication;
    private isAuthenticated;
    private waitForAuthenticatedPage;
    private loginAuthenticationDiagnostic;
    private clearProfileSingleton;
    private profileOwnerPid;
    private processIsAlive;
    private waitForProfileUnlock;
    private captureLoginState;
    private inferenceArgs;
    private verifyStorageState;
    /** Verify the IndexedDB-free fallback before it replaces a portable account. */
    private verifyFallbackStorageState;
    private closeBrowser;
    private closeVirtualDisplaySessions;
    /** Cancel any pending delayed-close timer for an account (the browser is needed now). */
    private cancelPendingClose;
    /** Schedule closing an account browser after its scheduler becomes idle. */
    private scheduleCloseWhenIdle;
    private scheduleClose;
    private launchBrowser;
    private ensureBrowser;
    private ensureContext;
    private trackContext;
    private captureAccountSnapshot;
    private commitAccountSnapshot;
    /** Preserve a provider-rotated session after a recoverable failed turn. */
    private recoverAuthenticatedSnapshot;
    /**
     * Persist reauth-required only when the canonical account is still the
     * bootstrapped revision and the lease is current, then invalidate turns.
     */
    private handleSignedOut;
    /** Open the account's loopback noVNC login desktop for sign-in. */
    login(accountId: AccountId): Promise<AccountStatus>;
    private loginAccount;
    private startRemoteLogin;
    private persistLoginProfile;
    /** Report persisted account and active remote-login state. */
    status(accountId: AccountId): Promise<AccountStatus>;
    private accountStatus;
    /** Run one long provider Deep Research request in an isolated durable conversation. */
    research(accountId: AccountId, request: ChatRequest): Promise<ChatResult>;
    /** Run one browser chat turn against an authenticated account and return rendered markdown. */
    chat(accountId: AccountId, request: ChatRequest): Promise<ChatResult>;
    private chatAccount;
    /** Close the account's managed inference browser, if one is open. */
    stop(accountId: AccountId): Promise<void>;
    private closeAccountResources;
    /** Close every managed inference browser (no leaked Chrome processes). */
    dispose(): Promise<void>;
}
//# sourceMappingURL=runtime.d.ts.map