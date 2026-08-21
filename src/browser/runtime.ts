import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	lstatSync,
	readFileSync,
	readlinkSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import {
	CHATGPT_HOME_URL,
	chatgptIsAuthenticated,
	chatgptLastAssistantTurnText,
	chatgptSend,
	chatgptSnapshot,
	chatgptWaitAuthenticated,
} from "#internet/browser/chatgpt";
import { discoverChrome } from "#internet/browser/chrome";
import { waitForStableCompletion } from "#internet/browser/completion";
import {
	type ChatGptConversationBinding,
	ChatGptConversationStore,
	parseChatGptConversationUrl,
} from "#internet/browser/conversations";
import {
	GEMINI_HOME_URL,
	geminiIsAuthenticated,
	geminiSend,
	geminiSnapshot,
	geminiWaitAuthenticated,
} from "#internet/browser/gemini";
import { ensureProviderDirectories, type ProviderLocations, providerLocations } from "#internet/browser/storage";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

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

interface ManagedSession {
	browser: Browser;
	context: BrowserContext;
	headless: boolean;
}

interface VerificationMarker {
	version: 1;
	authenticated: true;
	verifiedAt: string;
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Owns isolated browser sessions. Interactive login runs in a separately
 * spawned normal Chrome profile (without Playwright automation flags). After
 * the user closes Chrome, Playwright reads the unlocked profile, manually
 * exports and verifies storage state, removes the temporary profile, and
 * inference creates a fresh non-persistent context. This avoids OAuth failures and
 * Chrome profile singleton locks.
 */
export class BrowserManager {
	private readonly config: BrowserConfig;
	private readonly configuredChromePath: string | undefined;
	private resolvedChromePath: string | undefined;
	private readonly sessions = new Map<WebProvider, ManagedSession>();
	private readonly chatGptConversations: ChatGptConversationStore;

	constructor(config: BrowserConfig) {
		this.config = config;
		this.configuredChromePath = config.chromePath;
		this.chatGptConversations = new ChatGptConversationStore(config.dataDir);
	}

	private chromeExecutable(): string {
		this.resolvedChromePath ??= discoverChrome(this.configuredChromePath);
		return this.resolvedChromePath;
	}

	private locations(provider: WebProvider): ProviderLocations {
		return providerLocations(this.config.dataDir, provider);
	}

	private storageStateExists(provider: WebProvider): boolean {
		const { storageStatePath, verificationMarkerPath } = this.locations(provider);
		if (!existsSync(storageStatePath) || !existsSync(verificationMarkerPath)) return false;
		try {
			const marker = JSON.parse(readFileSync(verificationMarkerPath, "utf8")) as Partial<VerificationMarker>;
			return marker.version === 1 && marker.authenticated === true && typeof marker.verifiedAt === "string";
		} catch {
			return false;
		}
	}

	private writePrivateJson(path: string, value: unknown): void {
		const temporary = `${path}.tmp-${process.pid}`;
		try {
			writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
			renameSync(temporary, path);
			chmodSync(path, 0o600);
		} finally {
			rmSync(temporary, { force: true });
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
		await this.waitForProfileUnlock(profileDir);
	}

	private async exportContextState(context: BrowserContext): Promise<StorageState> {
		const cookies = await context.cookies();
		const origins: StorageState["origins"] = [];
		const seen = new Set<string>();
		for (const page of context.pages()) {
			if (page.isClosed()) continue;
			try {
				const url = new URL(page.url());
				if (!url.protocol.startsWith("http") || seen.has(url.origin)) continue;
				const localStorage = await page.evaluate<Array<{ name: string; value: string }>>(
					"Object.keys(window.localStorage).map(name => ({ name, value: window.localStorage.getItem(name) ?? '' }))",
				);
				origins.push({ origin: url.origin, localStorage });
				seen.add(url.origin);
			} catch {
				// Ignore pages that navigate or close while browser state is exported.
			}
		}
		return { cookies, origins };
	}

	private async captureLoginState(provider: WebProvider): Promise<StorageState> {
		const { profileDir } = this.locations(provider);
		const context = await chromium.launchPersistentContext(profileDir, {
			executablePath: this.chromeExecutable(),
			headless: false,
			ignoreDefaultArgs: ["--no-sandbox", "--password-store=basic", "--use-mock-keychain"],
			args: [
				"--no-first-run",
				"--no-default-browser-check",
				"--window-position=-10000,-10000",
				"--window-size=800,600",
			],
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
			return this.exportContextState(context);
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

	private async verifyStorageState(provider: WebProvider, storageState: StorageState): Promise<void> {
		const browser = await chromium.launch({
			executablePath: this.chromeExecutable(),
			headless: this.config.headless,
			ignoreDefaultArgs: this.config.headless ? undefined : ["--no-sandbox"],
			args: [
				...this.inferenceArgs(this.config.headless),
				...(this.config.headless ? [] : ["--window-position=-10000,-10000", "--window-size=800,600"]),
			],
		});
		try {
			const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
			try {
				const page = await context.newPage();
				await page.goto(this.homeUrl(provider), { waitUntil: "domcontentloaded", timeout: 60_000 });
				if (!(await this.isAuthenticated(provider, page, Math.min(this.config.loginTimeoutMs, 60_000)))) {
					throw new InternetError(
						"login_failed",
						`${provider} login state could not be restored in the configured inference browser.`,
					);
				}
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

	private async ensureContext(provider: WebProvider, headless: boolean): Promise<BrowserContext> {
		const existing = this.sessions.get(provider);
		if (existing?.browser.isConnected() && existing.headless === headless) {
			return existing.context;
		}
		await this.closeSession(provider);
		if (!this.storageStateExists(provider)) {
			throw new InternetError("login_required", `Sign in to ${provider} first with internet_browser login.`);
		}

		const browser = await chromium.launch({
			executablePath: this.chromeExecutable(),
			headless,
			ignoreDefaultArgs: headless ? undefined : ["--no-sandbox"],
			args: this.inferenceArgs(headless),
		});
		try {
			const context = await browser.newContext({
				storageState: this.locations(provider).storageStatePath,
				viewport: { width: 1280, height: 900 },
			});
			this.sessions.set(provider, { browser, context, headless });
			browser.once("disconnected", () => {
				if (this.sessions.get(provider)?.browser === browser) this.sessions.delete(provider);
			});
			return context;
		} catch (error) {
			await browser.close().catch(() => {});
			throw error;
		}
	}

	/** Open normal Chrome for sign-in; export its profile after the user closes it. */
	async login(provider: WebProvider): Promise<ProviderStatus> {
		await this.stop(provider);
		const locations = this.locations(provider);
		rmSync(locations.profileDir, { recursive: true, force: true });
		ensureProviderDirectories(this.config.dataDir, provider);
		try {
			await this.launchNormalLogin(provider);
			const storageState = await this.captureLoginState(provider);
			await this.verifyStorageState(provider, storageState);
			this.writePrivateJson(locations.storageStatePath, storageState);
			this.writePrivateJson(locations.verificationMarkerPath, {
				version: 1,
				authenticated: true,
				verifiedAt: new Date().toISOString(),
			} satisfies VerificationMarker);
			return { provider, loggedIn: true, storageStatePath: locations.storageStatePath };
		} finally {
			rmSync(locations.profileDir, { recursive: true, force: true });
		}
	}

	/** Report whether a provider has an exported, verified login state. */
	async status(provider: WebProvider): Promise<ProviderStatus> {
		return {
			provider,
			loggedIn: this.storageStateExists(provider),
			storageStatePath: this.locations(provider).storageStatePath,
		};
	}

	/** Run one browser chat turn against the provider and return rendered markdown. */
	async chat(provider: WebProvider, request: ChatRequest): Promise<ChatResult> {
		const context = await this.ensureContext(provider, this.config.headless);
		const page = await this.activePage(context);
		let binding: ChatGptConversationBinding | undefined;
		try {
			binding = provider === "chatgpt-web" ? this.chatGptConversations.read(request.sessionId) : undefined;
		} catch (error) {
			throw new InternetError(
				"provider_error",
				error instanceof Error ? error.message : "Failed to read the ChatGPT conversation binding.",
			);
		}
		const targetUrl = binding?.conversationUrl ?? this.homeUrl(provider);
		if (page.url() !== targetUrl) {
			await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
		}
		if (!(await this.isAuthenticated(provider, page, 30_000, request.signal))) {
			rmSync(this.locations(provider).verificationMarkerPath, { force: true });
			await this.stop(provider);
			throw new InternetError(
				"login_required",
				`Sign in to ${provider} first with the internet_browser login action.`,
			);
		}
		if (binding !== undefined) {
			let current: { id: string; url: string };
			try {
				current = parseChatGptConversationUrl(page.url());
			} catch {
				throw new InternetError(
					"provider_error",
					`ChatGPT conversation ${binding.conversationId} is unavailable for DSH session ${request.sessionId}.`,
				);
			}
			if (current.id !== binding.conversationId) {
				throw new InternetError(
					"provider_error",
					`DSH session ${request.sessionId} is bound to ChatGPT conversation ${binding.conversationId}, not ${current.id}.`,
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
			await geminiSend(page, request.prompt);
			text = await waitForStableCompletion(() => geminiSnapshot(page), waitOptions);
		}
		this.writePrivateJson(this.locations(provider).storageStatePath, await context.storageState());
		return {
			text: text.slice(0, this.config.maxOutputChars),
			url: page.url(),
			...(conversationId === undefined ? {} : { conversationId }),
		};
	}

	/** Close the provider's managed inference browser, if one is open. */
	async stop(provider: WebProvider): Promise<void> {
		await this.closeSession(provider);
	}

	/** Close every managed inference browser (no leaked Chrome processes). */
	async dispose(): Promise<void> {
		await Promise.all([...this.sessions.keys()].map((provider) => this.closeSession(provider)));
	}
}
