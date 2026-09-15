import { type Page } from "patchright-core";
import { type AccountState, type ReauthDiagnostic } from "#internet/browser/accounts";
import { type ProviderProgressEvent } from "#internet/browser/completion";
import { type RemoteLoginStatus } from "#internet/browser/remote-login";
import { type ResponseRepresentation } from "#internet/browser/response";
import { type AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import type { WorkflowApprovalScope } from "#internet/workflow/approval-policy";
export interface ChatRequest {
    prompt: string;
    /** Durable owner key: the current DSH agent/session ID. */
    sessionId: string;
    /** Stable logical request identity used to reconcile workflow retries. */
    requestKey?: string;
    /** Show automated Chrome on the user-managed display instead of managed Xvfb. */
    visible?: boolean;
    /** Enables provider Deep Research before this request is submitted. */
    research?: boolean;
    /** Representation returned after semantic provider completion. */
    responseRepresentation?: ResponseRepresentation;
    /** Override the normal-turn hard completion deadline. */
    timeoutMs?: number;
    /** Optional semantic no-progress deadline, independent from the hard deadline. */
    stallTimeoutMs?: number;
    /** Best-effort semantic provider progress observer. */
    onProgress?: (event: ProviderProgressEvent) => void;
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
    private readonly turnReceipts;
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
    private turnReceiptStore;
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
    private verifyFallbackStorageState;
    private closeBrowser;
    private closeVirtualDisplaySessions;
    private cancelPendingClose;
    private scheduleCloseWhenIdle;
    private scheduleClose;
    private launchBrowser;
    private ensureBrowser;
    private ensureContext;
    private trackContext;
    private captureAccountSnapshot;
    private commitAccountSnapshot;
    private recoverAuthenticatedSnapshot;
    private handleSignedOut;
    login(accountId: AccountId): Promise<AccountStatus>;
    private loginAccount;
    private startRemoteLogin;
    private persistLoginProfile;
    status(accountId: AccountId): Promise<AccountStatus>;
    private accountStatus;
    research(accountId: AccountId, request: ChatRequest): Promise<ChatResult>;
    chat(accountId: AccountId, request: ChatRequest): Promise<ChatResult>;
    private chatAccount;
    stop(accountId: AccountId): Promise<void>;
    private closeAccountResources;
    dispose(): Promise<void>;
}
//# sourceMappingURL=runtime.d.ts.map