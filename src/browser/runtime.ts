import { lstatSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "patchright-core";
import {
	type AccountState,
	AccountStore,
	capturePortableStorageState,
	captureProfileBootstrapState,
	type PortableStorageState,
	preserveIndexedDb,
	type ReauthDiagnostic,
} from "#internet/browser/accounts";
import type { AuthenticationAssessment } from "#internet/browser/authentication";
import {
	CHATGPT_HOME_URL,
	chatgptAuthenticationAssessment,
	chatgptAuthenticationDiagnostic,
	chatgptLastAssistantTurnText,
	chatgptSelectThinkingLevel,
	chatgptSend,
	chatgptSnapshot,
	chatgptWaitAuthenticationAssessment,
} from "#internet/browser/chatgpt";
import { chatgptHandleWorkflowConfirmation } from "#internet/browser/chatgpt-confirmation";
import {
	chatgptDeepResearchSnapshot,
	chatgptEnableDeepResearch,
	chatgptSendDeepResearch,
} from "#internet/browser/chatgpt-research";
import { discoverChrome } from "#internet/browser/chrome";
import { waitForStableCompletion } from "#internet/browser/completion";
import {
	type ConversationBinding,
	ConversationStore,
	parseChatGptConversationUrl,
	parseGeminiConversationUrl,
} from "#internet/browser/conversations";
import { BrowserDisplayManager, browserViewport, headedWindowArgs } from "#internet/browser/display";
import {
	GEMINI_HOME_URL,
	geminiAuthenticationAssessment,
	geminiDeepResearchSnapshot,
	geminiLastDeepResearchReportText,
	geminiLastResponseText,
	geminiSelectDefaultMode,
	geminiSend,
	geminiSnapshot,
	geminiWaitAuthenticationAssessment,
} from "#internet/browser/gemini";
import { geminiEnableDeepResearch, geminiStartResearchPlan } from "#internet/browser/gemini-research";
import { type ProviderLease, ProviderScheduler } from "#internet/browser/provider-scheduler";
import { RemoteLoginSession, type RemoteLoginStatus } from "#internet/browser/remote-login";
import { type AccountLocations, accountLocations, ensureLoginProfileDirectory } from "#internet/browser/storage";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";
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

interface ManagedBrowser {
	browser: Browser;
	headless: boolean;
	visible: boolean;
	displayKind: "headless" | "system" | "visible" | "virtual";
	viewport: ReturnType<typeof browserViewport>;
}

interface ContextBootstrap {
	context: BrowserContext;
	accountRevision: number;
	storageState: PortableStorageState;
}

function isTransientStorageCaptureError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /Protocol error \(Target\.(?:createTarget|createBrowserContext)\)|Failed to find browser context/i.test(
		message,
	);
}

/**
 * Owns isolated browser sessions. Interactive login runs in a dedicated,
 * per-account normal Chrome profile (without browser-automation flags). The
 * profile is retained so reopening login visibly shows the same signed-in account.
 * After Chrome closes, patchright verifies bootstrap profile state in a fresh
 * context and writes the canonical portable account file, including IndexedDB.
 * Inference uses only that account file in non-persistent contexts.
 */
export class BrowserManager {
	private readonly config: BrowserConfig;
	private readonly configuredChromePath: string | undefined;
	private resolvedChromePath: string | undefined;
	private readonly browsers = new Map<AccountId, ManagedBrowser>();
	private readonly browserLaunches = new Map<AccountId, Promise<ManagedBrowser>>();
	private readonly schedulers = new Map<AccountId, ProviderScheduler>();
	private readonly remoteLogins = new Map<AccountId, RemoteLoginSession>();
	private readonly accounts: AccountStore;
	private readonly conversations = new Map<AccountId, ConversationStore>();
	private readonly pendingCloses = new Map<AccountId, NodeJS.Timeout>();
	private readonly activeContexts = new Map<AccountId, Map<AbortSignal, BrowserContext>>();
	private readonly accountCommitQueues = new Map<AccountId, Promise<void>>();
	private readonly display: BrowserDisplayManager;
	private disposed = false;

	constructor(config: BrowserConfig) {
		this.config = config;
		this.display = new BrowserDisplayManager({
			onVirtualDisplayExit: () => {
				void this.closeVirtualDisplaySessions();
			},
		});
		this.configuredChromePath = config.chromePath;
		this.accounts = new AccountStore(config.dataDir);
	}

	private chromeExecutable(): string {
		this.resolvedChromePath ??= discoverChrome(this.configuredChromePath);
		return this.resolvedChromePath;
	}

	private provider(accountId: AccountId): WebProvider {
		return getAccountDefinition(accountId).provider;
	}

	private locations(accountId: AccountId): AccountLocations {
		return accountLocations(this.config.dataDir, accountId);
	}

	private conversationStore(accountId: AccountId): ConversationStore {
		let store = this.conversations.get(accountId);
		if (store === undefined) {
			store = new ConversationStore(this.config.dataDir, accountId);
			this.conversations.set(accountId, store);
		}
		return store;
	}

	private scheduler(accountId: AccountId): ProviderScheduler {
		let scheduler = this.schedulers.get(accountId);
		if (scheduler === undefined) {
			scheduler = new ProviderScheduler(this.config.maxConcurrentTurnsPerAccount);
			this.schedulers.set(accountId, scheduler);
		}
		return scheduler;
	}

	private invalidateAccount(accountId: AccountId, message: string): void {
		this.scheduler(accountId).invalidate(new InternetError("aborted", message));
	}

	private async runAccountExclusive<T>(accountId: AccountId, operation: () => Promise<T>): Promise<T> {
		if (this.disposed) throw new InternetError("browser_unavailable", "Browser manager has been disposed.");
		this.cancelPendingClose(accountId);
		this.invalidateAccount(accountId, "account lifecycle operation superseded queued browser turns");
		return this.scheduler(accountId).runExclusive(operation);
	}

	private homeUrl(provider: WebProvider): string {
		return provider === "chatgpt-web" ? CHATGPT_HOME_URL : GEMINI_HOME_URL;
	}

	private async activePage(context: BrowserContext): Promise<Page> {
		const pages = context.pages();
		if (pages.length > 0 && !pages[0].isClosed()) return pages[0];
		return context.newPage();
	}

	private async authenticationAssessment(provider: WebProvider, page: Page): Promise<AuthenticationAssessment> {
		return provider === "chatgpt-web" ? chatgptAuthenticationAssessment(page) : geminiAuthenticationAssessment(page);
	}

	private async assessAuthentication(
		provider: WebProvider,
		page: Page,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<AuthenticationAssessment> {
		return provider === "chatgpt-web"
			? chatgptWaitAuthenticationAssessment(page, timeoutMs, signal)
			: geminiWaitAuthenticationAssessment(page, timeoutMs, signal);
	}

	private async isAuthenticated(
		provider: WebProvider,
		page: Page,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<boolean> {
		return (await this.assessAuthentication(provider, page, timeoutMs, signal)).state === "authenticated";
	}

	private async waitForChatGptConversationUrl(
		page: Page,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<{ id: string; url: string }> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (signal?.aborted) {
				throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
			}
			try {
				return parseChatGptConversationUrl(page.url());
			} catch {
				await sleep(100, signal);
			}
		}
		throw new InternetError("provider_error", "ChatGPT did not expose a canonical conversation URL after the turn.");
	}

	private async waitForGeminiConversationUrl(
		page: Page,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<{ id: string; url: string }> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (signal?.aborted) {
				throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
			}
			try {
				return parseGeminiConversationUrl(page.url());
			} catch {
				await sleep(100, signal);
			}
		}
		throw new InternetError("provider_error", "Gemini did not expose a canonical conversation URL after the turn.");
	}

	private async waitForAuthenticatedPage(
		provider: WebProvider,
		context: BrowserContext,
		timeoutMs: number,
	): Promise<Page | undefined> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			for (const page of context.pages()) {
				if (page.isClosed()) continue;
				try {
					if ((await this.authenticationAssessment(provider, page)).state === "authenticated") return page;
				} catch {
					// A redirect can replace or close a page; inspect the context again.
				}
			}
			await sleep(250);
		}
		return undefined;
	}

	private async loginAuthenticationDiagnostic(
		provider: WebProvider,
		context: BrowserContext,
	): Promise<Record<string, unknown>> {
		const pages: Array<Record<string, unknown>> = [];
		for (const page of context.pages()) {
			if (page.isClosed()) continue;
			try {
				if (provider === "chatgpt-web") {
					pages.push({ ...(await chatgptAuthenticationDiagnostic(page)) });
					continue;
				}
				let originPath: string | undefined;
				try {
					const url = new URL(page.url());
					originPath = `${url.origin}${url.pathname}`;
				} catch {
					// Ignore an unstable navigation URL.
				}
				const assessment = await geminiAuthenticationAssessment(page);
				pages.push({ ...(originPath === undefined ? {} : { originPath }), assessment });
			} catch {
				pages.push({ diagnostic: "unavailable" });
			}
		}
		return { provider, pages };
	}

	private clearProfileSingleton(profileDir: string): void {
		for (const filename of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
			rmSync(join(profileDir, filename), { force: true });
		}
	}

	private profileOwnerPid(profileDir: string): number | undefined {
		const lockPath = join(profileDir, "SingletonLock");
		try {
			if (!lstatSync(lockPath).isSymbolicLink()) return 0;
			const match = readlinkSync(lockPath).match(/-(\d+)$/);
			return match === null ? 0 : Number.parseInt(match[1] ?? "", 10);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			return 0;
		}
	}

	private processIsAlive(pid: number): boolean {
		if (pid <= 0) return true;
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code !== "ESRCH";
		}
	}

	private async waitForProfileUnlock(profileDir: string): Promise<void> {
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline) {
			const ownerPid = this.profileOwnerPid(profileDir);
			if (ownerPid === undefined || !this.processIsAlive(ownerPid)) {
				this.clearProfileSingleton(profileDir);
				return;
			}
			await sleep(100);
		}
		throw new InternetError(
			"login_failed",
			"Login Chrome did not release the profile after Save account; retry the login session.",
		);
	}

	private async captureLoginState(accountId: AccountId): Promise<PortableStorageState> {
		const provider = this.provider(accountId);
		const { profileDir } = this.locations(accountId);
		const display = await this.display.prepare(false);
		const context = await chromium.launchPersistentContext(profileDir, {
			executablePath: this.chromeExecutable(),
			headless: false,
			env: display.kind === "headless" ? undefined : display.env,
			viewport: browserViewport(display),
			ignoreDefaultArgs: ["--no-sandbox", "--password-store=basic", "--use-mock-keychain"],
			args: ["--no-first-run", "--no-default-browser-check", ...headedWindowArgs(display)],
		});
		try {
			const page = await this.activePage(context);
			await page.goto(this.homeUrl(provider), { waitUntil: "domcontentloaded", timeout: 60_000 });
			const authenticatedPage = await this.waitForAuthenticatedPage(
				provider,
				context,
				Math.min(this.config.loginTimeoutMs, 60_000),
			);
			if (authenticatedPage === undefined) {
				const diagnostic = await this.loginAuthenticationDiagnostic(provider, context);
				throw new InternetError(
					"login_failed",
					`${provider} authentication remained unconfirmed after profile reopen; diagnostic: ${JSON.stringify(diagnostic)}`,
				);
			}
			return captureProfileBootstrapState(context);
		} finally {
			await context.close().catch(() => {});
			this.clearProfileSingleton(profileDir);
		}
	}

	private inferenceArgs(headless: boolean): string[] {
		return [
			...(headless ? ["--no-sandbox"] : []),
			"--disable-dev-shm-usage",
			"--no-first-run",
			"--no-default-browser-check",
		];
	}

	private async verifyStorageState(
		provider: WebProvider,
		storageState: PortableStorageState,
	): Promise<PortableStorageState> {
		const display = await this.display.prepare(this.config.headless);
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const browser = await chromium.launch({
				executablePath: this.chromeExecutable(),
				headless: this.config.headless,
				env: display.kind === "headless" ? undefined : display.env,
				ignoreDefaultArgs: this.config.headless ? undefined : ["--no-sandbox"],
				args: [
					...this.inferenceArgs(this.config.headless),
					...(this.config.headless ? [] : headedWindowArgs(display)),
				],
			});
			try {
				const context = await browser.newContext({ storageState, viewport: browserViewport(display) });
				try {
					const page = await context.newPage();
					await page.goto(this.homeUrl(provider), { waitUntil: "domcontentloaded", timeout: 60_000 });
					if (!(await this.isAuthenticated(provider, page, Math.min(this.config.loginTimeoutMs, 60_000)))) {
						throw new InternetError(
							"login_failed",
							`${provider} login state could not be restored in the configured inference browser.`,
						);
					}
					const capture = await capturePortableStorageState(context);
					if (!capture.indexedDbCaptured) {
						await this.verifyFallbackStorageState(
							provider,
							browser,
							capture.storageState,
							browserViewport(display),
						);
					}
					return capture.storageState;
				} finally {
					await context.close().catch(() => {});
				}
			} catch (error) {
				if (attempt > 0 || !isTransientStorageCaptureError(error)) throw error;
			} finally {
				await browser.close().catch(() => {});
			}
		}
		throw new InternetError("login_failed", `${provider} portable account capture failed.`);
	}

	/** Verify the IndexedDB-free fallback before it replaces a portable account. */
	private async verifyFallbackStorageState(
		provider: WebProvider,
		browser: Browser,
		storageState: PortableStorageState,
		viewport: ReturnType<typeof browserViewport>,
	): Promise<void> {
		const context = await browser.newContext({ storageState, viewport });
		try {
			const page = await context.newPage();
			await page.goto(this.homeUrl(provider), { waitUntil: "domcontentloaded", timeout: 60_000 });
			if (!(await this.isAuthenticated(provider, page, Math.min(this.config.loginTimeoutMs, 60_000)))) {
				throw new InternetError("login_failed", `${provider} login state could not be restored without IndexedDB.`);
			}
		} finally {
			await context.close().catch(() => {});
		}
	}

	private async closeBrowser(accountId: AccountId): Promise<void> {
		const managed = this.browsers.get(accountId);
		if (managed === undefined) return;
		this.browsers.delete(accountId);
		await managed.browser.close().catch(() => {});
	}

	private async closeVirtualDisplaySessions(): Promise<void> {
		const accountIds = [...this.browsers]
			.filter(([, managed]) => managed.displayKind === "virtual")
			.map(([accountId]) => accountId);
		await Promise.all(
			accountIds.map((accountId) =>
				this.runAccountExclusive(accountId, () => this.closeBrowser(accountId)).catch(() => {}),
			),
		);
	}

	/** Cancel any pending delayed-close timer for an account (the browser is needed now). */
	private cancelPendingClose(accountId: AccountId): void {
		const timer = this.pendingCloses.get(accountId);
		if (timer === undefined) return;
		clearTimeout(timer);
		this.pendingCloses.delete(accountId);
	}

	/** Schedule closing an account browser after its scheduler becomes idle. */
	private scheduleCloseWhenIdle(accountId: AccountId): void {
		const scheduler = this.scheduler(accountId);
		void scheduler.waitForIdle().then(() => {
			if (this.disposed || !scheduler.isIdle) return;
			this.scheduleClose(accountId);
		});
	}

	private scheduleClose(accountId: AccountId): void {
		if (this.disposed || !this.scheduler(accountId).isIdle) return;
		this.cancelPendingClose(accountId);
		const timer = setTimeout(() => {
			this.pendingCloses.delete(accountId);
			void this.stop(accountId).catch(() => {});
		}, this.config.closeAfterMs);
		this.pendingCloses.set(accountId, timer);
	}

	private async launchBrowser(accountId: AccountId, headless: boolean, visible: boolean): Promise<ManagedBrowser> {
		const display = await this.display.prepare(headless, visible);
		const browser = await chromium.launch({
			executablePath: this.chromeExecutable(),
			headless,
			env: display.kind === "headless" ? undefined : display.env,
			ignoreDefaultArgs: headless ? undefined : ["--no-sandbox"],
			args: [...this.inferenceArgs(headless), ...(headless ? [] : headedWindowArgs(display))],
		});
		const managed: ManagedBrowser = {
			browser,
			headless,
			visible,
			displayKind: display.kind,
			viewport: browserViewport(display),
		};
		browser.once("disconnected", () => {
			if (this.browsers.get(accountId)?.browser === browser) this.browsers.delete(accountId);
		});
		return managed;
	}

	private async ensureBrowser(accountId: AccountId, headless: boolean, visible: boolean): Promise<ManagedBrowser> {
		const existing = this.browsers.get(accountId);
		if (existing?.browser.isConnected() && existing.headless === headless && existing.visible === visible)
			return existing;
		if (existing !== undefined) await this.closeBrowser(accountId);

		const pending = this.browserLaunches.get(accountId);
		if (pending !== undefined) return pending;
		const launch = this.launchBrowser(accountId, headless, visible);
		this.browserLaunches.set(accountId, launch);
		try {
			const managed = await launch;
			this.browsers.set(accountId, managed);
			return managed;
		} finally {
			if (this.browserLaunches.get(accountId) === launch) this.browserLaunches.delete(accountId);
		}
	}

	private async ensureContext(accountId: AccountId, headless: boolean, visible: boolean): Promise<ContextBootstrap> {
		const inspection = this.accounts.inspect(accountId);
		if (inspection.state === "invalid") {
			throw new InternetError("provider_error", `${accountId} account file is invalid: ${inspection.error}`);
		}
		if (inspection.state !== "ready" || inspection.account === undefined) {
			throw new InternetError("login_required", `Sign in to ${accountId} first with internet_browser login.`);
		}
		const managed = await this.ensureBrowser(accountId, headless, visible);
		try {
			const context = await managed.browser.newContext({
				storageState: inspection.account.storageState,
				viewport: managed.viewport,
			});
			return {
				context,
				accountRevision: inspection.account.revision,
				storageState: inspection.account.storageState,
			};
		} catch (error) {
			if (!managed.browser.isConnected()) this.browsers.delete(accountId);
			throw error;
		}
	}

	private trackContext(accountId: AccountId, lease: ProviderLease, context: BrowserContext): () => void {
		let contexts = this.activeContexts.get(accountId);
		if (contexts === undefined) {
			contexts = new Map();
			this.activeContexts.set(accountId, contexts);
		}
		const closeOnAbort = (): void => {
			void context.close().catch(() => {});
		};
		contexts.set(lease.signal, context);
		lease.signal.addEventListener("abort", closeOnAbort, { once: true });
		if (lease.signal.aborted) closeOnAbort();
		return () => {
			lease.signal.removeEventListener("abort", closeOnAbort);
			const current = this.activeContexts.get(accountId);
			if (current === undefined) return;
			current.delete(lease.signal);
			if (current.size === 0) this.activeContexts.delete(accountId);
		};
	}

	private async captureAccountSnapshot(
		context: BrowserContext,
		previousStorageState: PortableStorageState,
	): Promise<PortableStorageState> {
		const capture = await capturePortableStorageState(context);
		return capture.indexedDbCaptured
			? capture.storageState
			: preserveIndexedDb(capture.storageState, previousStorageState);
	}

	private async commitAccountSnapshot(
		accountId: AccountId,
		lease: ProviderLease,
		expectedRevision: number,
		storageState: PortableStorageState,
	): Promise<void> {
		const previous = this.accountCommitQueues.get(accountId) ?? Promise.resolve();
		const commit = previous
			.catch(() => {})
			.then(() => {
				if (!this.scheduler(accountId).isCurrent(lease)) return;
				this.accounts.writeReadyIfRevision(accountId, expectedRevision, storageState);
			});
		this.accountCommitQueues.set(accountId, commit);
		try {
			await commit;
		} finally {
			if (this.accountCommitQueues.get(accountId) === commit) this.accountCommitQueues.delete(accountId);
		}
	}

	/** Preserve a provider-rotated session after a recoverable failed turn. */
	private async recoverAuthenticatedSnapshot(
		accountId: AccountId,
		provider: WebProvider,
		page: Page,
		context: BrowserContext,
		lease: ProviderLease,
		accountRevision: number,
		previousStorageState: PortableStorageState,
	): Promise<void> {
		try {
			if (!this.scheduler(accountId).isCurrent(lease)) return;
			const assessment = await this.assessAuthentication(provider, page, 5_000, lease.signal);
			if (assessment.state === "signed-out") {
				await this.handleSignedOut(accountId, lease, accountRevision, assessment.evidence);
				return;
			}
			if (assessment.state !== "authenticated" || !this.scheduler(accountId).isCurrent(lease)) return;
			const storageState = await this.captureAccountSnapshot(context, previousStorageState);
			await this.commitAccountSnapshot(accountId, lease, accountRevision, storageState);
		} catch {
			// Keep the original turn error; recovery is an opportunistic state refresh.
		}
	}

	/**
	 * Persist reauth-required only when the canonical account is still the
	 * bootstrapped revision and the lease is current, then invalidate turns.
	 */
	private async handleSignedOut(
		accountId: AccountId,
		lease: ProviderLease,
		accountRevision: number,
		evidence: "login-url" | "login-surface",
	): Promise<void> {
		if (!this.scheduler(accountId).isCurrent(lease)) return;
		const invalidated = this.accounts.markReauthRequiredIfRevision(accountId, accountRevision, new Date(), {
			observedAt: new Date().toISOString(),
			evidence,
		});
		if (invalidated === undefined) return;
		this.scheduler(accountId).invalidate(
			new InternetError("login_required", `Sign in to ${accountId} first with the internet_browser login action.`),
		);
		void this.scheduler(accountId)
			.runExclusive(() => this.closeBrowser(accountId))
			.catch(() => {});
	}

	/** Open the account's loopback noVNC login desktop for sign-in. */
	async login(accountId: AccountId): Promise<AccountStatus> {
		return this.runAccountExclusive(accountId, () => this.loginAccount(accountId));
	}

	private async loginAccount(accountId: AccountId): Promise<AccountStatus> {
		const active = this.remoteLogins.get(accountId);
		if (active?.status().state === "waiting" || active?.status().state === "finalizing") {
			return this.accountStatus(accountId);
		}
		if (active !== undefined) {
			this.remoteLogins.delete(accountId);
			await active.dispose();
		}
		await this.closeAccountResources(accountId);
		ensureLoginProfileDirectory(this.config.dataDir, accountId);
		if (process.platform !== "linux") {
			throw new InternetError("browser_unavailable", "SSH-forwarded remote login is supported only on Linux.");
		}
		await this.startRemoteLogin(accountId);
		return this.accountStatus(accountId);
	}

	private async startRemoteLogin(accountId: AccountId): Promise<void> {
		const provider = this.provider(accountId);
		const locations = this.locations(accountId);
		let session: RemoteLoginSession;
		session = await RemoteLoginSession.start({
			provider,
			dataDir: this.config.dataDir,
			chromePath: this.chromeExecutable(),
			profileDir: locations.profileDir,
			homeUrl: this.homeUrl(provider),
			timeoutMs: this.config.loginTimeoutMs,
			port: this.config.remoteLoginPort + ACCOUNT_IDS.indexOf(accountId),
			finalize: () =>
				this.runAccountExclusive(accountId, async () => {
					if (this.remoteLogins.get(accountId) !== session || session.status().state !== "finalizing") {
						throw new InternetError("aborted", "Remote login was cancelled before finalization.");
					}
					await this.persistLoginProfile(accountId);
				}),
			onClosed: () => {
				if (this.remoteLogins.get(accountId) === session) this.remoteLogins.delete(accountId);
			},
		});
		this.remoteLogins.set(accountId, session);
	}

	private async persistLoginProfile(accountId: AccountId): Promise<void> {
		const provider = this.provider(accountId);
		await this.waitForProfileUnlock(this.locations(accountId).profileDir);
		const bootstrapState = await this.captureLoginState(accountId);
		const storageState = await this.verifyStorageState(provider, bootstrapState);
		this.accounts.writeReady(accountId, storageState);
	}

	/** Report persisted account and active remote-login state. */
	async status(accountId: AccountId): Promise<AccountStatus> {
		return this.accountStatus(accountId);
	}

	private accountStatus(accountId: AccountId): AccountStatus {
		const provider = this.provider(accountId);
		const inspection = this.accounts.inspect(accountId);
		const remoteLogin = this.remoteLogins.get(accountId)?.status();
		return {
			accountId,
			provider,
			state: inspection.state,
			accountPath: inspection.path,
			...(inspection.account === undefined
				? {}
				: {
						account: {
							verifiedAt: inspection.account.verifiedAt,
							revision: inspection.account.revision,
							...(inspection.account.reauthDiagnostic === undefined
								? {}
								: { reauthDiagnostic: inspection.account.reauthDiagnostic }),
						},
					}),
			...(remoteLogin === undefined ? {} : { remoteLogin }),
		};
	}

	/** Run one long provider Deep Research request in an isolated durable conversation. */
	async research(accountId: AccountId, request: ChatRequest): Promise<ChatResult> {
		return this.chat(accountId, { ...request, research: true, timeoutMs: this.config.researchTimeoutMs });
	}

	/** Run one browser chat turn against an authenticated account and return rendered markdown. */
	async chat(accountId: AccountId, request: ChatRequest): Promise<ChatResult> {
		if (this.disposed) throw new InternetError("browser_unavailable", "Browser manager has been disposed.");
		this.cancelPendingClose(accountId);
		const scheduler = this.scheduler(accountId);
		try {
			return request.visible === true
				? await scheduler.runExclusive((lease) => this.chatAccount(accountId, request, lease), request.signal)
				: await scheduler.runTurn(request.sessionId, request.signal, (lease) =>
						this.chatAccount(accountId, request, lease),
					);
		} finally {
			this.scheduleCloseWhenIdle(accountId);
		}
	}

	private async chatAccount(accountId: AccountId, request: ChatRequest, lease: ProviderLease): Promise<ChatResult> {
		const provider = this.provider(accountId);
		const remoteState = this.remoteLogins.get(accountId)?.status().state;
		if (remoteState === "waiting" || remoteState === "finalizing") {
			throw new InternetError(
				"login_required",
				`${accountId} remote login is ${remoteState}; save or stop it first.`,
			);
		}
		this.cancelPendingClose(accountId);
		const visible = request.visible === true;
		const headless = visible ? false : this.config.headless;
		const {
			context,
			accountRevision,
			storageState: previousStorageState,
		} = await this.ensureContext(accountId, headless, visible);
		const untrackContext = this.trackContext(accountId, lease, context);
		let page: Page | undefined;
		try {
			page = await this.activePage(context);
			let binding: ConversationBinding | undefined;
			try {
				binding = this.conversationStore(accountId).read(request.sessionId);
			} catch (error) {
				throw new InternetError(
					"provider_error",
					error instanceof Error ? error.message : `Failed to read the ${provider} conversation binding.`,
				);
			}
			const targetUrl = binding?.conversationUrl ?? this.homeUrl(provider);
			// ChatGPT leaves transient post-response controls that can swallow the
			// next submission; reload its bound conversation before follow-ups.
			if ((provider === "chatgpt-web" && binding !== undefined) || page.url() !== targetUrl) {
				await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
			}
			const authentication = await this.assessAuthentication(provider, page, 30_000, lease.signal);
			if (authentication.state !== "authenticated") {
				if (authentication.state === "signed-out") {
					await this.handleSignedOut(accountId, lease, accountRevision, authentication.evidence);
					throw new InternetError(
						"login_required",
						`Sign in to ${accountId} first with the internet_browser login action.`,
					);
				}
				throw new InternetError(
					"provider_error",
					`${provider} authentication could not be confirmed (${authentication.state}; ${authentication.evidence}). Retry the turn or inspect the provider visibly before signing in again.`,
				);
			}
			if (binding !== undefined) {
				let current: { id: string; url: string };
				try {
					current =
						provider === "chatgpt-web"
							? parseChatGptConversationUrl(page.url())
							: parseGeminiConversationUrl(page.url());
				} catch {
					throw new InternetError(
						"provider_error",
						`${provider} conversation ${binding.conversationId} is unavailable for DSH session ${request.sessionId}.`,
					);
				}
				if (current.id !== binding.conversationId) {
					throw new InternetError(
						"provider_error",
						`DSH session ${request.sessionId} is bound to ${provider} conversation ${binding.conversationId}, not ${current.id}.`,
					);
				}
			}

			const waitOptions = {
				timeoutMs: request.timeoutMs ?? this.config.turnTimeoutMs,
				pollMs: this.config.pollMs,
				stableMs: this.config.stableMs,
				signal: lease.signal,
			};
			let text: string;
			let conversationId: string | undefined;
			if (provider === "chatgpt-web") {
				const previousTurnText = await chatgptLastAssistantTurnText(page);
				const previousResearchText =
					request.research === true ? (await chatgptDeepResearchSnapshot(page)).text : undefined;
				if (request.research === true) {
					await chatgptEnableDeepResearch(page);
					await chatgptSendDeepResearch(page, request.prompt);
				} else {
					await chatgptSelectThinkingLevel(page, this.config.chatgptThinkingLevel);
					await chatgptSend(page, request.prompt);
				}
				// Persist the native URL immediately after Send so a long-running
				// Deep Research can be inspected or recovered if observation is cancelled.
				const conversation = await this.waitForChatGptConversationUrl(
					page,
					Math.min(this.config.turnTimeoutMs, 30_000),
					lease.signal,
				);
				try {
					binding = this.conversationStore(accountId).bind(request.sessionId, conversation.url);
				} catch (error) {
					throw new InternetError(
						"provider_error",
						error instanceof Error ? error.message : "Failed to persist the ChatGPT conversation binding.",
					);
				}
				conversationId = binding.conversationId;
				text = await waitForStableCompletion(
					() =>
						request.research === true
							? chatgptDeepResearchSnapshot(page!, previousResearchText)
							: (async () => {
									if (request.confirmation !== undefined) {
										await chatgptHandleWorkflowConfirmation(
											page!,
											request.confirmation,
											accountId,
											request.sessionId,
										);
									}
									return chatgptSnapshot(page!, previousTurnText);
								})(),
					waitOptions,
				);
			} else {
				const previousTurnText = await geminiLastResponseText(page);
				const previousResearchText =
					request.research === true ? await geminiLastDeepResearchReportText(page) : undefined;
				if (request.research === true) await geminiEnableDeepResearch(page);
				else await geminiSelectDefaultMode(page);
				await geminiSend(page, request.prompt);
				// Persist the native URL immediately after Send so a long-running
				// Deep Research can be inspected or recovered if observation is cancelled.
				const conversation = await this.waitForGeminiConversationUrl(
					page,
					Math.min(this.config.turnTimeoutMs, 30_000),
					lease.signal,
				);
				try {
					binding = this.conversationStore(accountId).bind(request.sessionId, conversation.url);
				} catch (error) {
					throw new InternetError(
						"provider_error",
						error instanceof Error ? error.message : "Failed to persist the Gemini conversation binding.",
					);
				}
				conversationId = binding.conversationId;
				if (request.research === true) await geminiStartResearchPlan(page);
				text = await waitForStableCompletion(
					() =>
						request.research === true
							? geminiDeepResearchSnapshot(page!, previousResearchText)
							: geminiSnapshot(page!, previousTurnText),
					waitOptions,
				);
			}
			const storageState = await this.captureAccountSnapshot(context, previousStorageState);
			await this.commitAccountSnapshot(accountId, lease, accountRevision, storageState);
			return {
				text: text.slice(0, this.config.maxOutputChars),
				url: page.url(),
				...(conversationId === undefined ? {} : { conversationId }),
			};
		} catch (error) {
			if (page !== undefined) {
				await this.recoverAuthenticatedSnapshot(
					accountId,
					provider,
					page,
					context,
					lease,
					accountRevision,
					previousStorageState,
				);
			}
			throw error;
		} finally {
			untrackContext();
			await context.close().catch(() => {});
		}
	}

	/** Close the account's managed inference browser, if one is open. */
	async stop(accountId: AccountId): Promise<void> {
		await this.runAccountExclusive(accountId, () => this.closeAccountResources(accountId));
	}

	private async closeAccountResources(accountId: AccountId): Promise<void> {
		this.cancelPendingClose(accountId);
		const remote = this.remoteLogins.get(accountId);
		if (remote !== undefined) {
			await remote.waitForFinalization();
			if (this.remoteLogins.get(accountId) === remote) this.remoteLogins.delete(accountId);
			await remote.cancel();
		}
		await this.closeBrowser(accountId);
	}

	/** Close every managed inference browser (no leaked Chrome processes). */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		for (const timer of this.pendingCloses.values()) clearTimeout(timer);
		this.pendingCloses.clear();
		const closed = new InternetError("aborted", "Browser manager has been disposed.");
		for (const scheduler of this.schedulers.values()) scheduler.close(closed);
		try {
			await Promise.all([...this.schedulers.values()].map((scheduler) => scheduler.waitForIdle()));
			const remoteLogins = [...this.remoteLogins.values()];
			this.remoteLogins.clear();
			await Promise.all(remoteLogins.map((session) => session.dispose()));
			await Promise.all([...this.browsers.keys()].map((accountId) => this.closeBrowser(accountId)));
		} finally {
			await this.display.dispose();
		}
	}
}
