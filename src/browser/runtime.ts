import { spawn } from "node:child_process";
import { lstatSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "patchright-core";
import {
	type AccountState,
	AccountStore,
	capturePortableStorageState,
	captureProfileBootstrapState,
	type PortableStorageState,
} from "#internet/browser/accounts";
import {
	CHATGPT_HOME_URL,
	chatgptIsAuthenticated,
	chatgptLastAssistantTurnText,
	chatgptSelectThinkingLevel,
	chatgptSend,
	chatgptSnapshot,
	chatgptWaitAuthenticated,
} from "#internet/browser/chatgpt";
import { discoverChrome } from "#internet/browser/chrome";
import { waitForStableCompletion } from "#internet/browser/completion";
import {
	ChatGptConversationStore,
	type ConversationBinding,
	GeminiConversationStore,
	parseChatGptConversationUrl,
	parseGeminiConversationUrl,
} from "#internet/browser/conversations";
import { BrowserDisplayManager, browserViewport, headedWindowArgs } from "#internet/browser/display";
import {
	GEMINI_HOME_URL,
	geminiIsAuthenticated,
	geminiLastResponseText,
	geminiSend,
	geminiSnapshot,
	geminiWaitAuthenticated,
} from "#internet/browser/gemini";
import { RemoteLoginSession, type RemoteLoginStatus } from "#internet/browser/remote-login";
import { ensureLoginProfileDirectory, type ProviderLocations, providerLocations } from "#internet/browser/storage";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

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
	remoteLogin?: RemoteLoginStatus;
}

interface ManagedSession {
	browser: Browser;
	context: BrowserContext;
	headless: boolean;
	visible: boolean;
	displayKind: "headless" | "system" | "visible" | "virtual";
}

/**
 * Owns isolated browser sessions. Interactive login runs in a dedicated,
 * per-provider normal Chrome profile (without browser-automation flags). The
 * profile is retained so reopening login visibly shows the same signed-in account.
 * After Chrome closes, patchright verifies bootstrap profile state in a fresh
 * context and writes the canonical portable account file, including IndexedDB.
 * Inference uses only that account file in non-persistent contexts.
 */
export class BrowserManager {
	private readonly config: BrowserConfig;
	private readonly configuredChromePath: string | undefined;
	private resolvedChromePath: string | undefined;
	private readonly sessions = new Map<WebProvider, ManagedSession>();
	private readonly remoteLogins = new Map<WebProvider, RemoteLoginSession>();
	private readonly accounts: AccountStore;
	private readonly chatGptConversations: ChatGptConversationStore;
	private readonly geminiConversations: GeminiConversationStore;
	private readonly pendingCloses = new Map<WebProvider, NodeJS.Timeout>();
	private readonly providerOperations = new Map<WebProvider, Promise<void>>();
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
		this.chatGptConversations = new ChatGptConversationStore(config.dataDir);
		this.geminiConversations = new GeminiConversationStore(config.dataDir);
	}

	private chromeExecutable(): string {
		this.resolvedChromePath ??= discoverChrome(this.configuredChromePath);
		return this.resolvedChromePath;
	}

	private locations(provider: WebProvider): ProviderLocations {
		return providerLocations(this.config.dataDir, provider);
	}

	private async serializeProvider<T>(provider: WebProvider, operation: () => Promise<T>): Promise<T> {
		if (this.disposed) throw new InternetError("browser_unavailable", "Browser manager has been disposed.");
		const previous = this.providerOperations.get(provider) ?? Promise.resolve();
		let release = (): void => {};
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => current);
		this.providerOperations.set(provider, tail);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.providerOperations.get(provider) === tail) this.providerOperations.delete(provider);
		}
	}

	private homeUrl(provider: WebProvider): string {
		return provider === "chatgpt-web" ? CHATGPT_HOME_URL : GEMINI_HOME_URL;
	}

	private async activePage(context: BrowserContext): Promise<Page> {
		const pages = context.pages();
		if (pages.length > 0 && !pages[0].isClosed()) return pages[0];
		return context.newPage();
	}

	private async isAuthenticated(
		provider: WebProvider,
		page: Page,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<boolean> {
		return provider === "chatgpt-web"
			? chatgptWaitAuthenticated(page, timeoutMs, signal)
			: geminiWaitAuthenticated(page, timeoutMs, signal);
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
					const authenticated =
						provider === "chatgpt-web" ? await chatgptIsAuthenticated(page) : await geminiIsAuthenticated(page);
					if (authenticated) return page;
				} catch {
					// A redirect can replace or close a page; inspect the context again.
				}
			}
			await sleep(250);
		}
		return undefined;
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
			"Normal Chrome is still using the login profile. Close the dedicated Chrome window completely.",
		);
	}

	private async launchNormalLogin(provider: WebProvider): Promise<void> {
		const { profileDir } = this.locations(provider);
		const child = spawn(
			this.chromeExecutable(),
			[
				`--user-data-dir=${profileDir}`,
				"--new-window",
				"--disable-background-mode",
				"--no-first-run",
				"--no-default-browser-check",
				this.homeUrl(provider),
			],
			{ env: process.env, stdio: "ignore" },
		);

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const finish = (action: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				action();
			};
			const timer = setTimeout(() => {
				child.kill("SIGTERM");
				finish(() =>
					reject(
						new InternetError(
							"timeout",
							`Sign in to ${provider} and close the dedicated Chrome window within the login timeout.`,
						),
					),
				);
			}, this.config.loginTimeoutMs);
			child.once("error", (error) => finish(() => reject(error)));
			child.once("exit", (code, signal) => {
				if (signal !== null) {
					finish(() =>
						reject(new InternetError("login_failed", `${provider} login Chrome exited from signal ${signal}`)),
					);
				} else if (code !== 0) {
					finish(() =>
						reject(new InternetError("login_failed", `${provider} login Chrome exited with status ${code}`)),
					);
				} else {
					finish(resolve);
				}
			});
		});
	}

	private async captureLoginState(provider: WebProvider): Promise<PortableStorageState> {
		const { profileDir } = this.locations(provider);
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
				throw new InternetError("login_failed", `${provider} did not expose an authenticated page after sign-in.`);
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
				return capturePortableStorageState(context);
			} finally {
				await context.close().catch(() => {});
			}
		} finally {
			await browser.close().catch(() => {});
		}
	}

	private async closeSession(provider: WebProvider): Promise<void> {
		const session = this.sessions.get(provider);
		if (session === undefined) return;
		this.sessions.delete(provider);
		await session.context.close().catch(() => {});
		await session.browser.close().catch(() => {});
	}

	private async closeVirtualDisplaySessions(): Promise<void> {
		const providers = [...this.sessions]
			.filter(([, session]) => session.displayKind === "virtual")
			.map(([provider]) => provider);
		await Promise.all(providers.map((provider) => this.closeSession(provider)));
	}

	/** Cancel any pending delayed-close timer for a provider (the browser is needed now). */
	private cancelPendingClose(provider: WebProvider): void {
		const timer = this.pendingCloses.get(provider);
		if (timer === undefined) return;
		clearTimeout(timer);
		this.pendingCloses.delete(provider);
	}

	/** Schedule closing a provider browser after its idle TTL. */
	private scheduleClose(provider: WebProvider): void {
		if (this.disposed) return;
		this.cancelPendingClose(provider);
		const timer = setTimeout(() => {
			this.pendingCloses.delete(provider);
			void this.stop(provider).catch(() => {});
		}, this.config.closeAfterMs);
		this.pendingCloses.set(provider, timer);
	}

	private async ensureContext(provider: WebProvider, headless: boolean, visible: boolean): Promise<BrowserContext> {
		const existing = this.sessions.get(provider);
		if (existing?.browser.isConnected() && existing.headless === headless && existing.visible === visible) {
			return existing.context;
		}
		await this.closeSession(provider);
		const inspection = this.accounts.inspect(provider);
		if (inspection.state === "invalid") {
			throw new InternetError("provider_error", `${provider} account file is invalid: ${inspection.error}`);
		}
		if (inspection.state !== "ready" || inspection.account === undefined) {
			throw new InternetError("login_required", `Sign in to ${provider} first with internet_browser login.`);
		}

		const display = await this.display.prepare(headless, visible);
		const browser = await chromium.launch({
			executablePath: this.chromeExecutable(),
			headless,
			env: display.kind === "headless" ? undefined : display.env,
			ignoreDefaultArgs: headless ? undefined : ["--no-sandbox"],
			args: [...this.inferenceArgs(headless), ...(headless ? [] : headedWindowArgs(display))],
		});
		try {
			const context = await browser.newContext({
				storageState: inspection.account.storageState,
				viewport: browserViewport(display),
			});
			this.sessions.set(provider, { browser, context, headless, visible, displayKind: display.kind });
			browser.once("disconnected", () => {
				if (this.sessions.get(provider)?.browser === browser) this.sessions.delete(provider);
			});
			return context;
		} catch (error) {
			await browser.close().catch(() => {});
			throw error;
		}
	}

	/** Open local or SSH-forwarded normal Chrome for sign-in. */
	async login(provider: WebProvider, options: LoginOptions = {}): Promise<ProviderStatus> {
		return this.serializeProvider(provider, () => this.loginProvider(provider, options));
	}

	private async loginProvider(provider: WebProvider, options: LoginOptions): Promise<ProviderStatus> {
		const active = this.remoteLogins.get(provider);
		if (active?.status().state === "waiting" || active?.status().state === "finalizing") {
			return this.providerStatus(provider);
		}
		if (active !== undefined) {
			this.remoteLogins.delete(provider);
			await active.dispose();
		}
		await this.stopProvider(provider);
		ensureLoginProfileDirectory(this.config.dataDir, provider);
		const remote = options.remote === true || !this.display.hasInteractiveDisplay();
		if (!remote) {
			this.display.requireInteractiveDisplay();
			await this.launchNormalLogin(provider);
			await this.persistLoginProfile(provider);
			return this.providerStatus(provider);
		}
		if (process.platform !== "linux") {
			throw new InternetError("browser_unavailable", "SSH-forwarded remote login is supported only on Linux.");
		}
		await this.startRemoteLogin(provider);
		return this.providerStatus(provider);
	}

	private async startRemoteLogin(provider: WebProvider): Promise<void> {
		const locations = this.locations(provider);
		let session: RemoteLoginSession;
		session = await RemoteLoginSession.start({
			provider,
			dataDir: this.config.dataDir,
			chromePath: this.chromeExecutable(),
			profileDir: locations.profileDir,
			homeUrl: this.homeUrl(provider),
			timeoutMs: this.config.loginTimeoutMs,
			finalize: () =>
				this.serializeProvider(provider, async () => {
					if (this.remoteLogins.get(provider) !== session || session.status().state !== "finalizing") {
						throw new InternetError("aborted", "Remote login was cancelled before finalization.");
					}
					await this.persistLoginProfile(provider);
				}),
			onClosed: () => {
				if (this.remoteLogins.get(provider) === session) this.remoteLogins.delete(provider);
			},
		});
		this.remoteLogins.set(provider, session);
	}

	private async persistLoginProfile(provider: WebProvider): Promise<void> {
		await this.waitForProfileUnlock(this.locations(provider).profileDir);
		const bootstrapState = await this.captureLoginState(provider);
		const storageState = await this.verifyStorageState(provider, bootstrapState);
		this.accounts.writeReady(provider, storageState);
	}

	/** Report persisted account and active remote-login state. */
	async status(provider: WebProvider): Promise<ProviderStatus> {
		return this.providerStatus(provider);
	}

	private providerStatus(provider: WebProvider): ProviderStatus {
		const inspection = this.accounts.inspect(provider);
		const remoteLogin = this.remoteLogins.get(provider)?.status();
		return {
			provider,
			state: inspection.state,
			accountPath: inspection.path,
			...(remoteLogin === undefined ? {} : { remoteLogin }),
		};
	}

	/** Run one browser chat turn against the provider and return rendered markdown. */
	async chat(provider: WebProvider, request: ChatRequest): Promise<ChatResult> {
		return this.serializeProvider(provider, () => this.chatProvider(provider, request));
	}

	private async chatProvider(provider: WebProvider, request: ChatRequest): Promise<ChatResult> {
		const remoteState = this.remoteLogins.get(provider)?.status().state;
		if (remoteState === "waiting" || remoteState === "finalizing") {
			throw new InternetError(
				"login_required",
				`${provider} remote login is ${remoteState}; save or stop it first.`,
			);
		}
		this.cancelPendingClose(provider);
		const visible = request.visible === true;
		const headless = visible ? false : this.config.headless;
		const context = await this.ensureContext(provider, headless, visible);
		try {
			const page = await this.activePage(context);
			let binding: ConversationBinding | undefined;
			try {
				binding =
					provider === "chatgpt-web"
						? this.chatGptConversations.read(request.sessionId)
						: this.geminiConversations.read(request.sessionId);
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
			if (!(await this.isAuthenticated(provider, page, 30_000, request.signal))) {
				this.accounts.markReauthRequired(provider);
				await this.stopProvider(provider);
				throw new InternetError(
					"login_required",
					`Sign in to ${provider} first with the internet_browser login action.`,
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
				timeoutMs: this.config.turnTimeoutMs,
				pollMs: this.config.pollMs,
				stableMs: this.config.stableMs,
				signal: request.signal,
			};
			let text: string;
			let conversationId: string | undefined;
			if (provider === "chatgpt-web") {
				const previousTurnText = await chatgptLastAssistantTurnText(page);
				await chatgptSelectThinkingLevel(page, this.config.chatgptThinkingLevel);
				await chatgptSend(page, request.prompt);
				text = await waitForStableCompletion(() => chatgptSnapshot(page, previousTurnText), waitOptions);
				const conversation = await this.waitForChatGptConversationUrl(
					page,
					Math.min(this.config.turnTimeoutMs, 30_000),
					request.signal,
				);
				try {
					binding = this.chatGptConversations.bind(request.sessionId, conversation.url);
				} catch (error) {
					throw new InternetError(
						"provider_error",
						error instanceof Error ? error.message : "Failed to persist the ChatGPT conversation binding.",
					);
				}
				conversationId = binding.conversationId;
			} else {
				const previousTurnText = await geminiLastResponseText(page);
				await geminiSend(page, request.prompt);
				text = await waitForStableCompletion(() => geminiSnapshot(page, previousTurnText), waitOptions);
				const conversation = await this.waitForGeminiConversationUrl(
					page,
					Math.min(this.config.turnTimeoutMs, 30_000),
					request.signal,
				);
				try {
					binding = this.geminiConversations.bind(request.sessionId, conversation.url);
				} catch (error) {
					throw new InternetError(
						"provider_error",
						error instanceof Error ? error.message : "Failed to persist the Gemini conversation binding.",
					);
				}
				conversationId = binding.conversationId;
			}
			this.accounts.writeReady(provider, await capturePortableStorageState(context));
			return {
				text: text.slice(0, this.config.maxOutputChars),
				url: page.url(),
				...(conversationId === undefined ? {} : { conversationId }),
			};
		} finally {
			this.scheduleClose(provider);
		}
	}

	/** Close the provider's managed inference browser, if one is open. */
	async stop(provider: WebProvider): Promise<void> {
		await this.serializeProvider(provider, () => this.stopProvider(provider));
	}

	private async stopProvider(provider: WebProvider): Promise<void> {
		this.cancelPendingClose(provider);
		const remote = this.remoteLogins.get(provider);
		if (remote !== undefined) {
			await remote.waitForFinalization();
			if (this.remoteLogins.get(provider) === remote) this.remoteLogins.delete(provider);
			await remote.cancel();
		}
		await this.closeSession(provider);
	}

	/** Close every managed inference browser (no leaked Chrome processes). */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		for (const timer of this.pendingCloses.values()) clearTimeout(timer);
		this.pendingCloses.clear();
		try {
			await Promise.all(this.providerOperations.values());
			const remoteLogins = [...this.remoteLogins.values()];
			this.remoteLogins.clear();
			await Promise.all(remoteLogins.map((session) => session.dispose()));
			await Promise.all([...this.sessions.keys()].map((provider) => this.closeSession(provider)));
		} finally {
			await this.display.dispose();
		}
	}
}
