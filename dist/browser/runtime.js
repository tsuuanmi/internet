import { spawn } from "node:child_process";
import { lstatSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "patchright-core";
import { AccountStore, capturePortableStorageState, captureProfileBootstrapState, } from "#internet/browser/accounts";
import { CHATGPT_HOME_URL, chatgptIsAuthenticated, chatgptLastAssistantTurnText, chatgptSelectThinkingLevel, chatgptSend, chatgptSnapshot, chatgptWaitAuthenticated, } from "#internet/browser/chatgpt";
import { discoverChrome } from "#internet/browser/chrome";
import { waitForStableCompletion } from "#internet/browser/completion";
import { ChatGptConversationStore, GeminiConversationStore, parseChatGptConversationUrl, parseGeminiConversationUrl, } from "#internet/browser/conversations";
import { BrowserDisplayManager, browserViewport, headedWindowArgs } from "#internet/browser/display";
import { GEMINI_HOME_URL, geminiIsAuthenticated, geminiLastResponseText, geminiSend, geminiSnapshot, geminiWaitAuthenticated, } from "#internet/browser/gemini";
import { ProviderScheduler } from "#internet/browser/provider-scheduler";
import { RemoteLoginSession } from "#internet/browser/remote-login";
import { ensureLoginProfileDirectory, providerLocations } from "#internet/browser/storage";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";
function isTransientStorageCaptureError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /Protocol error \(Target\.(?:createTarget|createBrowserContext)\)|Failed to find browser context/i.test(message);
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
    constructor(config) {
        this.browsers = new Map();
        this.browserLaunches = new Map();
        this.schedulers = new Map();
        this.remoteLogins = new Map();
        this.pendingCloses = new Map();
        this.activeContexts = new Map();
        this.accountCommitQueues = new Map();
        this.disposed = false;
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
    chromeExecutable() {
        this.resolvedChromePath ??= discoverChrome(this.configuredChromePath);
        return this.resolvedChromePath;
    }
    locations(provider) {
        return providerLocations(this.config.dataDir, provider);
    }
    scheduler(provider) {
        let scheduler = this.schedulers.get(provider);
        if (scheduler === undefined) {
            scheduler = new ProviderScheduler(this.config.maxConcurrentTurnsPerProvider);
            this.schedulers.set(provider, scheduler);
        }
        return scheduler;
    }
    invalidateProvider(provider, message) {
        this.scheduler(provider).invalidate(new InternetError("aborted", message));
    }
    async runProviderExclusive(provider, operation) {
        if (this.disposed)
            throw new InternetError("browser_unavailable", "Browser manager has been disposed.");
        this.cancelPendingClose(provider);
        this.invalidateProvider(provider, "provider lifecycle operation superseded queued browser turns");
        return this.scheduler(provider).runExclusive(operation);
    }
    homeUrl(provider) {
        return provider === "chatgpt-web" ? CHATGPT_HOME_URL : GEMINI_HOME_URL;
    }
    async activePage(context) {
        const pages = context.pages();
        if (pages.length > 0 && !pages[0].isClosed())
            return pages[0];
        return context.newPage();
    }
    async isAuthenticated(provider, page, timeoutMs, signal) {
        return provider === "chatgpt-web"
            ? chatgptWaitAuthenticated(page, timeoutMs, signal)
            : geminiWaitAuthenticated(page, timeoutMs, signal);
    }
    async waitForChatGptConversationUrl(page, timeoutMs, signal) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (signal?.aborted) {
                throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
            }
            try {
                return parseChatGptConversationUrl(page.url());
            }
            catch {
                await sleep(100, signal);
            }
        }
        throw new InternetError("provider_error", "ChatGPT did not expose a canonical conversation URL after the turn.");
    }
    async waitForGeminiConversationUrl(page, timeoutMs, signal) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (signal?.aborted) {
                throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
            }
            try {
                return parseGeminiConversationUrl(page.url());
            }
            catch {
                await sleep(100, signal);
            }
        }
        throw new InternetError("provider_error", "Gemini did not expose a canonical conversation URL after the turn.");
    }
    async waitForAuthenticatedPage(provider, context, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            for (const page of context.pages()) {
                if (page.isClosed())
                    continue;
                try {
                    const authenticated = provider === "chatgpt-web" ? await chatgptIsAuthenticated(page) : await geminiIsAuthenticated(page);
                    if (authenticated)
                        return page;
                }
                catch {
                    // A redirect can replace or close a page; inspect the context again.
                }
            }
            await sleep(250);
        }
        return undefined;
    }
    clearProfileSingleton(profileDir) {
        for (const filename of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
            rmSync(join(profileDir, filename), { force: true });
        }
    }
    profileOwnerPid(profileDir) {
        const lockPath = join(profileDir, "SingletonLock");
        try {
            if (!lstatSync(lockPath).isSymbolicLink())
                return 0;
            const match = readlinkSync(lockPath).match(/-(\d+)$/);
            return match === null ? 0 : Number.parseInt(match[1] ?? "", 10);
        }
        catch (error) {
            if (error.code === "ENOENT")
                return undefined;
            return 0;
        }
    }
    processIsAlive(pid) {
        if (pid <= 0)
            return true;
        try {
            process.kill(pid, 0);
            return true;
        }
        catch (error) {
            return error.code !== "ESRCH";
        }
    }
    async waitForProfileUnlock(profileDir) {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const ownerPid = this.profileOwnerPid(profileDir);
            if (ownerPid === undefined || !this.processIsAlive(ownerPid)) {
                this.clearProfileSingleton(profileDir);
                return;
            }
            await sleep(100);
        }
        throw new InternetError("login_failed", "Normal Chrome is still using the login profile. Close the dedicated Chrome window completely.");
    }
    async launchNormalLogin(provider) {
        const { profileDir } = this.locations(provider);
        const child = spawn(this.chromeExecutable(), [
            `--user-data-dir=${profileDir}`,
            "--new-window",
            "--disable-background-mode",
            "--no-first-run",
            "--no-default-browser-check",
            this.homeUrl(provider),
        ], { env: process.env, stdio: "ignore" });
        await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (action) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                action();
            };
            const timer = setTimeout(() => {
                child.kill("SIGTERM");
                finish(() => reject(new InternetError("timeout", `Sign in to ${provider} and close the dedicated Chrome window within the login timeout.`)));
            }, this.config.loginTimeoutMs);
            child.once("error", (error) => finish(() => reject(error)));
            child.once("exit", (code, signal) => {
                if (signal !== null) {
                    finish(() => reject(new InternetError("login_failed", `${provider} login Chrome exited from signal ${signal}`)));
                }
                else if (code !== 0) {
                    finish(() => reject(new InternetError("login_failed", `${provider} login Chrome exited with status ${code}`)));
                }
                else {
                    finish(resolve);
                }
            });
        });
    }
    async captureLoginState(provider) {
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
            const authenticatedPage = await this.waitForAuthenticatedPage(provider, context, Math.min(this.config.loginTimeoutMs, 60_000));
            if (authenticatedPage === undefined) {
                throw new InternetError("login_failed", `${provider} did not expose an authenticated page after sign-in.`);
            }
            return captureProfileBootstrapState(context);
        }
        finally {
            await context.close().catch(() => { });
            this.clearProfileSingleton(profileDir);
        }
    }
    inferenceArgs(headless) {
        return [
            ...(headless ? ["--no-sandbox"] : []),
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
        ];
    }
    async verifyStorageState(provider, storageState) {
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
                        throw new InternetError("login_failed", `${provider} login state could not be restored in the configured inference browser.`);
                    }
                    return await capturePortableStorageState(context);
                }
                finally {
                    await context.close().catch(() => { });
                }
            }
            catch (error) {
                if (attempt > 0 || !isTransientStorageCaptureError(error))
                    throw error;
            }
            finally {
                await browser.close().catch(() => { });
            }
        }
        throw new InternetError("login_failed", `${provider} portable account capture failed.`);
    }
    async closeBrowser(provider) {
        const managed = this.browsers.get(provider);
        if (managed === undefined)
            return;
        this.browsers.delete(provider);
        await managed.browser.close().catch(() => { });
    }
    async closeVirtualDisplaySessions() {
        const providers = [...this.browsers]
            .filter(([, managed]) => managed.displayKind === "virtual")
            .map(([provider]) => provider);
        await Promise.all(providers.map((provider) => this.runProviderExclusive(provider, () => this.closeBrowser(provider)).catch(() => { })));
    }
    /** Cancel any pending delayed-close timer for a provider (the browser is needed now). */
    cancelPendingClose(provider) {
        const timer = this.pendingCloses.get(provider);
        if (timer === undefined)
            return;
        clearTimeout(timer);
        this.pendingCloses.delete(provider);
    }
    /** Schedule closing a provider browser after its scheduler becomes idle. */
    scheduleCloseWhenIdle(provider) {
        const scheduler = this.scheduler(provider);
        void scheduler.waitForIdle().then(() => {
            if (this.disposed || !scheduler.isIdle)
                return;
            this.scheduleClose(provider);
        });
    }
    scheduleClose(provider) {
        if (this.disposed || !this.scheduler(provider).isIdle)
            return;
        this.cancelPendingClose(provider);
        const timer = setTimeout(() => {
            this.pendingCloses.delete(provider);
            void this.stop(provider).catch(() => { });
        }, this.config.closeAfterMs);
        this.pendingCloses.set(provider, timer);
    }
    async launchBrowser(provider, headless, visible) {
        const display = await this.display.prepare(headless, visible);
        const browser = await chromium.launch({
            executablePath: this.chromeExecutable(),
            headless,
            env: display.kind === "headless" ? undefined : display.env,
            ignoreDefaultArgs: headless ? undefined : ["--no-sandbox"],
            args: [...this.inferenceArgs(headless), ...(headless ? [] : headedWindowArgs(display))],
        });
        const managed = {
            browser,
            headless,
            visible,
            displayKind: display.kind,
            viewport: browserViewport(display),
        };
        browser.once("disconnected", () => {
            if (this.browsers.get(provider)?.browser === browser)
                this.browsers.delete(provider);
        });
        return managed;
    }
    async ensureBrowser(provider, headless, visible) {
        const existing = this.browsers.get(provider);
        if (existing?.browser.isConnected() && existing.headless === headless && existing.visible === visible)
            return existing;
        if (existing !== undefined)
            await this.closeBrowser(provider);
        const pending = this.browserLaunches.get(provider);
        if (pending !== undefined)
            return pending;
        const launch = this.launchBrowser(provider, headless, visible);
        this.browserLaunches.set(provider, launch);
        try {
            const managed = await launch;
            this.browsers.set(provider, managed);
            return managed;
        }
        finally {
            if (this.browserLaunches.get(provider) === launch)
                this.browserLaunches.delete(provider);
        }
    }
    async ensureContext(provider, headless, visible) {
        const inspection = this.accounts.inspect(provider);
        if (inspection.state === "invalid") {
            throw new InternetError("provider_error", `${provider} account file is invalid: ${inspection.error}`);
        }
        if (inspection.state !== "ready" || inspection.account === undefined) {
            throw new InternetError("login_required", `Sign in to ${provider} first with internet_browser login.`);
        }
        const managed = await this.ensureBrowser(provider, headless, visible);
        try {
            const context = await managed.browser.newContext({
                storageState: inspection.account.storageState,
                viewport: managed.viewport,
            });
            return { context, accountRevision: inspection.account.revision };
        }
        catch (error) {
            if (!managed.browser.isConnected())
                this.browsers.delete(provider);
            throw error;
        }
    }
    trackContext(provider, lease, context) {
        let contexts = this.activeContexts.get(provider);
        if (contexts === undefined) {
            contexts = new Map();
            this.activeContexts.set(provider, contexts);
        }
        const closeOnAbort = () => {
            void context.close().catch(() => { });
        };
        contexts.set(lease.signal, context);
        lease.signal.addEventListener("abort", closeOnAbort, { once: true });
        if (lease.signal.aborted)
            closeOnAbort();
        return () => {
            lease.signal.removeEventListener("abort", closeOnAbort);
            const current = this.activeContexts.get(provider);
            if (current === undefined)
                return;
            current.delete(lease.signal);
            if (current.size === 0)
                this.activeContexts.delete(provider);
        };
    }
    async commitAccountSnapshot(provider, lease, expectedRevision, storageState) {
        const previous = this.accountCommitQueues.get(provider) ?? Promise.resolve();
        const commit = previous
            .catch(() => { })
            .then(() => {
            if (!this.scheduler(provider).isCurrent(lease))
                return;
            this.accounts.writeReadyIfRevision(provider, expectedRevision, storageState);
        });
        this.accountCommitQueues.set(provider, commit);
        try {
            await commit;
        }
        finally {
            if (this.accountCommitQueues.get(provider) === commit)
                this.accountCommitQueues.delete(provider);
        }
    }
    /** Open local or SSH-forwarded normal Chrome for sign-in. */
    async login(provider, options = {}) {
        return this.runProviderExclusive(provider, () => this.loginProvider(provider, options));
    }
    async loginProvider(provider, options) {
        const active = this.remoteLogins.get(provider);
        if (active?.status().state === "waiting" || active?.status().state === "finalizing") {
            return this.providerStatus(provider);
        }
        if (active !== undefined) {
            this.remoteLogins.delete(provider);
            await active.dispose();
        }
        await this.closeProviderResources(provider);
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
    async startRemoteLogin(provider) {
        const locations = this.locations(provider);
        let session;
        session = await RemoteLoginSession.start({
            provider,
            dataDir: this.config.dataDir,
            chromePath: this.chromeExecutable(),
            profileDir: locations.profileDir,
            homeUrl: this.homeUrl(provider),
            timeoutMs: this.config.loginTimeoutMs,
            port: this.config.remoteLoginPort + (provider === "gemini-web" ? 1 : 0),
            finalize: () => this.runProviderExclusive(provider, async () => {
                if (this.remoteLogins.get(provider) !== session || session.status().state !== "finalizing") {
                    throw new InternetError("aborted", "Remote login was cancelled before finalization.");
                }
                await this.persistLoginProfile(provider);
            }),
            onClosed: () => {
                if (this.remoteLogins.get(provider) === session)
                    this.remoteLogins.delete(provider);
            },
        });
        this.remoteLogins.set(provider, session);
    }
    async persistLoginProfile(provider) {
        await this.waitForProfileUnlock(this.locations(provider).profileDir);
        const bootstrapState = await this.captureLoginState(provider);
        const storageState = await this.verifyStorageState(provider, bootstrapState);
        this.accounts.writeReady(provider, storageState);
    }
    /** Report persisted account and active remote-login state. */
    async status(provider) {
        return this.providerStatus(provider);
    }
    providerStatus(provider) {
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
    async chat(provider, request) {
        if (this.disposed)
            throw new InternetError("browser_unavailable", "Browser manager has been disposed.");
        this.cancelPendingClose(provider);
        const scheduler = this.scheduler(provider);
        try {
            return request.visible === true
                ? await scheduler.runExclusive((lease) => this.chatProvider(provider, request, lease), request.signal)
                : await scheduler.runTurn(request.sessionId, request.signal, (lease) => this.chatProvider(provider, request, lease));
        }
        finally {
            this.scheduleCloseWhenIdle(provider);
        }
    }
    async chatProvider(provider, request, lease) {
        const remoteState = this.remoteLogins.get(provider)?.status().state;
        if (remoteState === "waiting" || remoteState === "finalizing") {
            throw new InternetError("login_required", `${provider} remote login is ${remoteState}; save or stop it first.`);
        }
        this.cancelPendingClose(provider);
        const visible = request.visible === true;
        const headless = visible ? false : this.config.headless;
        const { context, accountRevision } = await this.ensureContext(provider, headless, visible);
        const untrackContext = this.trackContext(provider, lease, context);
        try {
            const page = await this.activePage(context);
            let binding;
            try {
                binding =
                    provider === "chatgpt-web"
                        ? this.chatGptConversations.read(request.sessionId)
                        : this.geminiConversations.read(request.sessionId);
            }
            catch (error) {
                throw new InternetError("provider_error", error instanceof Error ? error.message : `Failed to read the ${provider} conversation binding.`);
            }
            const targetUrl = binding?.conversationUrl ?? this.homeUrl(provider);
            // ChatGPT leaves transient post-response controls that can swallow the
            // next submission; reload its bound conversation before follow-ups.
            if ((provider === "chatgpt-web" && binding !== undefined) || page.url() !== targetUrl) {
                await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
            }
            if (!(await this.isAuthenticated(provider, page, 30_000, lease.signal))) {
                const reason = new InternetError("login_required", `Sign in to ${provider} first with the internet_browser login action.`);
                this.accounts.markReauthRequired(provider);
                this.scheduler(provider).invalidate(reason);
                void this.scheduler(provider)
                    .runExclusive(() => this.closeBrowser(provider))
                    .catch(() => { });
                throw reason;
            }
            if (binding !== undefined) {
                let current;
                try {
                    current =
                        provider === "chatgpt-web"
                            ? parseChatGptConversationUrl(page.url())
                            : parseGeminiConversationUrl(page.url());
                }
                catch {
                    throw new InternetError("provider_error", `${provider} conversation ${binding.conversationId} is unavailable for DSH session ${request.sessionId}.`);
                }
                if (current.id !== binding.conversationId) {
                    throw new InternetError("provider_error", `DSH session ${request.sessionId} is bound to ${provider} conversation ${binding.conversationId}, not ${current.id}.`);
                }
            }
            const waitOptions = {
                timeoutMs: this.config.turnTimeoutMs,
                pollMs: this.config.pollMs,
                stableMs: this.config.stableMs,
                signal: lease.signal,
            };
            let text;
            let conversationId;
            if (provider === "chatgpt-web") {
                const previousTurnText = await chatgptLastAssistantTurnText(page);
                await chatgptSelectThinkingLevel(page, this.config.chatgptThinkingLevel);
                await chatgptSend(page, request.prompt);
                text = await waitForStableCompletion(() => chatgptSnapshot(page, previousTurnText), waitOptions);
                const conversation = await this.waitForChatGptConversationUrl(page, Math.min(this.config.turnTimeoutMs, 30_000), lease.signal);
                try {
                    binding = this.chatGptConversations.bind(request.sessionId, conversation.url);
                }
                catch (error) {
                    throw new InternetError("provider_error", error instanceof Error ? error.message : "Failed to persist the ChatGPT conversation binding.");
                }
                conversationId = binding.conversationId;
            }
            else {
                const previousTurnText = await geminiLastResponseText(page);
                await geminiSend(page, request.prompt);
                text = await waitForStableCompletion(() => geminiSnapshot(page, previousTurnText), waitOptions);
                const conversation = await this.waitForGeminiConversationUrl(page, Math.min(this.config.turnTimeoutMs, 30_000), lease.signal);
                try {
                    binding = this.geminiConversations.bind(request.sessionId, conversation.url);
                }
                catch (error) {
                    throw new InternetError("provider_error", error instanceof Error ? error.message : "Failed to persist the Gemini conversation binding.");
                }
                conversationId = binding.conversationId;
            }
            const storageState = await capturePortableStorageState(context);
            await this.commitAccountSnapshot(provider, lease, accountRevision, storageState);
            return {
                text: text.slice(0, this.config.maxOutputChars),
                url: page.url(),
                ...(conversationId === undefined ? {} : { conversationId }),
            };
        }
        finally {
            untrackContext();
            await context.close().catch(() => { });
        }
    }
    /** Close the provider's managed inference browser, if one is open. */
    async stop(provider) {
        await this.runProviderExclusive(provider, () => this.closeProviderResources(provider));
    }
    async closeProviderResources(provider) {
        this.cancelPendingClose(provider);
        const remote = this.remoteLogins.get(provider);
        if (remote !== undefined) {
            await remote.waitForFinalization();
            if (this.remoteLogins.get(provider) === remote)
                this.remoteLogins.delete(provider);
            await remote.cancel();
        }
        await this.closeBrowser(provider);
    }
    /** Close every managed inference browser (no leaked Chrome processes). */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const timer of this.pendingCloses.values())
            clearTimeout(timer);
        this.pendingCloses.clear();
        const closed = new InternetError("aborted", "Browser manager has been disposed.");
        for (const scheduler of this.schedulers.values())
            scheduler.close(closed);
        try {
            await Promise.all([...this.schedulers.values()].map((scheduler) => scheduler.waitForIdle()));
            const remoteLogins = [...this.remoteLogins.values()];
            this.remoteLogins.clear();
            await Promise.all(remoteLogins.map((session) => session.dispose()));
            await Promise.all([...this.browsers.keys()].map((provider) => this.closeBrowser(provider)));
        }
        finally {
            await this.display.dispose();
        }
    }
}
//# sourceMappingURL=runtime.js.map