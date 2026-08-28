import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "patchright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteLoginSession, type RemoteLoginStatus } from "#internet/browser/remote-login";
import { BrowserManager, type ProviderStatus } from "#internet/browser/runtime";
import { ensureLoginProfileDirectory, providerLocations } from "#internet/browser/storage";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";

const temporaryRoots: string[] = [];

function manager(): BrowserManager {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-runtime-"));
	temporaryRoots.push(dataDir);
	return new BrowserManager(resolveBrowserConfig({ dataDir }));
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("BrowserManager provider serialization", () => {
	it("runs only one operation per provider at a time", async () => {
		const browser = manager();
		const releases: Array<() => void> = [];
		let active = 0;
		let maximumActive = 0;
		const loginProvider = vi.fn(async (provider: "chatgpt-web"): Promise<ProviderStatus> => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return { provider, state: "ready", accountPath: "/account" };
		});
		(browser as any).loginProvider = loginProvider;

		const first = browser.login("chatgpt-web");
		const second = browser.login("chatgpt-web");
		await vi.waitFor(() => expect(loginProvider).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect(loginProvider).toHaveBeenCalledTimes(2));
		expect(maximumActive).toBe(1);
		releases.shift()?.();
		await Promise.all([first, second]);
		await browser.dispose();
	});

	it("does not schedule idle work after disposal begins", async () => {
		const browser = manager();
		let release = (): void => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const operation = (browser as any).serializeProvider("chatgpt-web", async () => {
			await gate;
			(browser as any).scheduleClose("chatgpt-web");
		});
		await vi.waitFor(() => expect((browser as any).providerOperations.size).toBe(1));
		const disposal = browser.dispose();
		release();
		await Promise.all([operation, disposal]);
		expect((browser as any).pendingCloses.size).toBe(0);
	});
});

describe("BrowserManager visible login profiles", () => {
	it.each(["chatgpt-web", "gemini-web"] as const)("retains the %s profile across login actions", async (provider) => {
		const dataDir = mkdtempSync(join(tmpdir(), "internet-login-profile-"));
		temporaryRoots.push(dataDir);
		ensureLoginProfileDirectory(dataDir, provider);
		const locations = providerLocations(dataDir, provider);
		const sentinelPath = join(locations.profileDir, "signed-in-profile-sentinel");
		writeFileSync(sentinelPath, provider);

		const browser = new BrowserManager(resolveBrowserConfig({ dataDir }));
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => true);
		(browser as any).display.requireInteractiveDisplay = vi.fn();
		(browser as any).launchNormalLogin = vi.fn(async (actualProvider: WebProvider) => {
			expect(actualProvider).toBe(provider);
			expect(existsSync(sentinelPath)).toBe(true);
		});
		const storageState = { cookies: [], origins: [] };
		(browser as any).captureLoginState = vi.fn(async () => {
			expect(existsSync(sentinelPath)).toBe(true);
			return storageState;
		});
		(browser as any).verifyStorageState = vi.fn(async () => storageState);

		await browser.login(provider);
		await browser.login(provider);

		expect(existsSync(sentinelPath)).toBe(true);
		expect((browser as any).launchNormalLogin).toHaveBeenCalledTimes(2);
		expect((browser as any).launchNormalLogin).toHaveBeenCalledWith(provider);
		expect((browser as any).accounts.inspect(provider).state).toBe("ready");
		await browser.dispose();
	});

	it("commits only the state recaptured by fresh-context verification", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "internet-login-state-"));
		temporaryRoots.push(dataDir);
		const browser = new BrowserManager(resolveBrowserConfig({ dataDir }));
		const bootstrap = { cookies: [], origins: [{ origin: "https://example.com", localStorage: [] }] };
		const verified = {
			cookies: [],
			origins: [{ origin: "https://example.com", localStorage: [], indexedDB: [{ name: "auth" }] }],
		};
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => true);
		(browser as any).display.requireInteractiveDisplay = vi.fn();
		(browser as any).launchNormalLogin = vi.fn(async () => {});
		(browser as any).captureLoginState = vi.fn(async () => bootstrap);
		(browser as any).verifyStorageState = vi.fn(async () => verified);

		await browser.login("gemini-web");

		expect((browser as any).verifyStorageState).toHaveBeenCalledWith("gemini-web", bootstrap);
		expect((browser as any).accounts.inspect("gemini-web").account.storageState).toEqual(verified);
		await browser.dispose();
	});

	it("preserves a ready account when a later login verification fails", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "internet-login-failure-"));
		temporaryRoots.push(dataDir);
		const browser = new BrowserManager(resolveBrowserConfig({ dataDir }));
		const original = { cookies: [], origins: [] };
		(browser as any).accounts.writeReady("chatgpt-web", original, new Date("2026-01-01T00:00:00.000Z"));
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => true);
		(browser as any).display.requireInteractiveDisplay = vi.fn();
		(browser as any).launchNormalLogin = vi.fn(async () => {});
		(browser as any).captureLoginState = vi.fn(async () => original);
		(browser as any).verifyStorageState = vi.fn(async () => {
			throw new Error("verification failed");
		});

		await expect(browser.login("chatgpt-web")).rejects.toThrow("verification failed");
		expect((browser as any).accounts.inspect("chatgpt-web")).toMatchObject({
			state: "ready",
			account: { verifiedAt: "2026-01-01T00:00:00.000Z", storageState: original },
		});
		await browser.dispose();
	});
});

describe("BrowserManager remote login", () => {
	function remoteFixture() {
		let state: RemoteLoginStatus["state"] = "waiting";
		const status = (): RemoteLoginStatus => ({
			state,
			message: `remote ${state}`,
			url: "http://127.0.0.1:3000/token/",
			port: 3000,
		});
		const session = {
			status: vi.fn(status),
			dispose: vi.fn(async () => {}),
			cancel: vi.fn(async () => {
				state = "failed";
			}),
			requestSave: vi.fn(async () => {}),
			waitForFinalization: vi.fn(async () => {}),
		};
		return {
			session,
			setState(next: RemoteLoginStatus["state"]): void {
				state = next;
			},
		};
	}

	it("automatically starts one reusable remote login without a display", async () => {
		const browser = manager();
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => false);
		const remote = remoteFixture();
		const start = vi.spyOn(RemoteLoginSession, "start").mockResolvedValue(remote.session as any);

		const first = await browser.login("chatgpt-web");
		const second = await browser.login("chatgpt-web");

		expect(first.remoteLogin).toMatchObject({ state: "waiting", port: 3000 });
		expect(second.remoteLogin).toMatchObject({ state: "waiting", port: 3000 });
		expect(start).toHaveBeenCalledTimes(1);
		await browser.dispose();
		expect(remote.session.dispose).toHaveBeenCalledTimes(1);
	});

	it("serializes remote finalization through the canonical profile pipeline", async () => {
		const browser = manager();
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => false);
		const persist = vi.spyOn(browser as any, "persistLoginProfile").mockResolvedValue(undefined);
		const remote = remoteFixture();
		let finalize: (() => Promise<void>) | undefined;
		vi.spyOn(RemoteLoginSession, "start").mockImplementation(async (options) => {
			finalize = options.finalize;
			return remote.session as any;
		});
		await browser.login("gemini-web");
		remote.setState("finalizing");
		await finalize?.();
		expect(persist).toHaveBeenCalledWith("gemini-web");
		await browser.stop("gemini-web");
		expect(remote.session.cancel).toHaveBeenCalledTimes(1);
		await browser.dispose();
	});
});

describe("BrowserManager portable-state verification", () => {
	it("retries a transient browser-context protocol failure once", async () => {
		const browser = manager();
		const verified = { cookies: [], origins: [{ origin: "https://example.com", localStorage: [] }] };
		const page = { goto: vi.fn(async () => {}) };
		const firstContext = {
			newPage: vi.fn(async () => page),
			storageState: vi.fn(async () => {
				throw new Error("Protocol error (Target.createTarget): Failed to find browser context with id deadbeef");
			}),
			close: vi.fn(async () => {}),
		};
		const secondContext = {
			newPage: vi.fn(async () => page),
			storageState: vi.fn(async () => verified),
			close: vi.fn(async () => {}),
		};
		const browsers = [firstContext, secondContext].map((context) => ({
			newContext: vi.fn(async () => context),
			close: vi.fn(async () => {}),
		}));
		vi.spyOn(chromium, "launch")
			.mockResolvedValueOnce(browsers[0] as any)
			.mockResolvedValueOnce(browsers[1] as any);
		(browser as any).display.prepare = vi.fn(async () => ({ kind: "headless" }));
		(browser as any).isAuthenticated = vi.fn(async () => true);

		await expect((browser as any).verifyStorageState("gemini-web", { cookies: [], origins: [] })).resolves.toEqual(
			verified,
		);
		expect(chromium.launch).toHaveBeenCalledTimes(2);
		await browser.dispose();
	});
});
