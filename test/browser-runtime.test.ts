import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "patchright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteLoginSession, type RemoteLoginStatus } from "#internet/browser/remote-login";
import { BrowserManager, type ChatRequest, type ChatResult, type ProviderStatus } from "#internet/browser/runtime";
import { ensureLoginProfileDirectory, providerLocations } from "#internet/browser/storage";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";

const temporaryRoots: string[] = [];

function manager(overrides: Record<string, unknown> = {}): BrowserManager {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-runtime-"));
	temporaryRoots.push(dataDir);
	return new BrowserManager(resolveBrowserConfig({ dataDir, ...overrides }));
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
		const scheduler = (browser as any).scheduler("chatgpt-web");
		const operation = scheduler.runTurn("session", undefined, async () => {
			await gate;
			(browser as any).scheduleClose("chatgpt-web");
		});
		await vi.waitFor(() => expect(scheduler.isIdle).toBe(false));
		const disposal = browser.dispose();
		release();
		await Promise.all([operation, disposal]);
		expect((browser as any).pendingCloses.size).toBe(0);
	});
});

describe("BrowserManager shared-account turn scheduling", () => {
	function request(sessionId: string, visible = false): ChatRequest {
		return { prompt: "test", sessionId, ...(visible ? { visible: true } : {}) };
	}

	it("runs different hidden sessions up to configured capacity", async () => {
		const browser = manager({ maxConcurrentTurnsPerProvider: 2 });
		const releases: Array<() => void> = [];
		let active = 0;
		let maximum = 0;
		(browser as any).chatProvider = vi.fn(async (): Promise<ChatResult> => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return { text: "ok", url: "https://example.com" };
		});

		const first = browser.chat("chatgpt-web", request("one"));
		const second = browser.chat("chatgpt-web", request("two"));
		const third = browser.chat("chatgpt-web", request("three"));
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(2));
		expect(maximum).toBe(2);
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(3));
		for (const release of releases.splice(0)) release();
		await Promise.all([first, second, third]);
		await browser.dispose();
	});

	it("serializes same-session hidden turns despite spare capacity", async () => {
		const browser = manager({ maxConcurrentTurnsPerProvider: 2 });
		const releases: Array<() => void> = [];
		(browser as any).chatProvider = vi.fn(async (): Promise<ChatResult> => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return { text: "ok", url: "https://example.com" };
		});

		const first = browser.chat("gemini-web", request("same"));
		const second = browser.chat("gemini-web", request("same"));
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(2));
		releases.shift()?.();
		await Promise.all([first, second]);
		await browser.dispose();
	});

	it("makes a visible turn an exclusive barrier after hidden work", async () => {
		const browser = manager({ maxConcurrentTurnsPerProvider: 2 });
		const releases: Array<() => void> = [];
		(browser as any).chatProvider = vi.fn(async (): Promise<ChatResult> => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return { text: "ok", url: "https://example.com" };
		});

		const hidden = browser.chat("chatgpt-web", request("hidden"));
		const visible = browser.chat("chatgpt-web", request("visible", true));
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(2));
		releases.shift()?.();
		await Promise.all([hidden, visible]);
		await browser.dispose();
	});

	it("passes request cancellation through an active visible exclusive turn", async () => {
		const browser = manager();
		let aborted = false;
		(browser as any).chatProvider = vi.fn(async (_provider: WebProvider, _request: ChatRequest, lease: any) => {
			await new Promise<void>((resolve) => {
				lease.signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						resolve();
					},
					{ once: true },
				);
			});
			return { text: "cancelled", url: "https://example.com" };
		});
		const controller = new AbortController();
		const visible = browser.chat("gemini-web", {
			prompt: "test",
			sessionId: "visible",
			visible: true,
			signal: controller.signal,
		});
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(1));
		controller.abort(new Error("cancelled"));
		await visible;
		expect(aborted).toBe(true);
		await browser.dispose();
	});

	it("commits one of two concurrent snapshots from the same account revision", async () => {
		const browser = manager({ maxConcurrentTurnsPerProvider: 2 });
		const original = { cookies: [], origins: [] };
		(browser as any).accounts.writeReady("chatgpt-web", original);
		const revision = (browser as any).accounts.inspect("chatgpt-web").account.revision;
		const first = { cookies: [], origins: [{ origin: "https://one.example", localStorage: [] }] };
		const second = { cookies: [], origins: [{ origin: "https://two.example", localStorage: [] }] };
		const lease = { generation: 0, signal: new AbortController().signal };

		await Promise.all([
			(browser as any).commitAccountSnapshot("chatgpt-web", lease, revision, first),
			(browser as any).commitAccountSnapshot("chatgpt-web", lease, revision, second),
		]);
		const account = (browser as any).accounts.inspect("chatgpt-web").account;
		expect(account.revision).toBe(revision + 1);
		expect([first, second]).toContainEqual(account.storageState);
		await browser.dispose();
	});

	it("aborts an active hidden lease before running a lifecycle exclusive", async () => {
		const browser = manager({ maxConcurrentTurnsPerProvider: 2 });
		let aborted = false;
		(browser as any).chatProvider = vi.fn(async (_provider: WebProvider, _request: ChatRequest, lease: any) => {
			await new Promise<void>((resolve) => {
				lease.signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						resolve();
					},
					{ once: true },
				);
			});
			return { text: "cancelled", url: "https://example.com" };
		});

		const hidden = browser.chat("chatgpt-web", request("hidden"));
		await vi.waitFor(() => expect((browser as any).chatProvider).toHaveBeenCalledTimes(1));
		await (browser as any).runProviderExclusive("chatgpt-web", async () => {});
		await hidden;
		expect(aborted).toBe(true);
		await browser.dispose();
	});
});

describe("BrowserManager authentication assessment", () => {
	function request(sessionId: string): ChatRequest {
		return { prompt: "test", sessionId };
	}

	function authenticatedContext(storageState = { cookies: [], origins: [] }) {
		return { close: vi.fn(async () => {}), storageState: vi.fn(async () => storageState) };
	}

	it("preserves a ready account for an unconfirmed or challenged page", async () => {
		for (const state of ["unconfirmed", "challenge"] as const) {
			const browser = manager();
			(browser as any).accounts.writeReady("chatgpt-web", { cookies: [], origins: [] });
			const context = authenticatedContext();
			const page = { goto: vi.fn(async () => {}), url: () => "https://chatgpt.com/challenge" };
			(browser as any).ensureContext = vi.fn(async () => ({ context, accountRevision: 1 }));
			(browser as any).trackContext = vi.fn(() => () => {});
			(browser as any).activePage = vi.fn(async () => page);
			(browser as any).assessAuthentication = vi.fn(async () => ({
				state,
				evidence: state === "challenge" ? "challenge-url" : "timeout",
			}));

			await expect(browser.chat("chatgpt-web", request("session"))).rejects.toMatchObject({
				kind: "provider_error",
			});
			expect((browser as any).accounts.inspect("chatgpt-web").state).toBe("ready");
			expect((browser as any).scheduler("chatgpt-web").currentGeneration()).toBe(0);
			await browser.dispose();
		}
	});

	it("invalidates only a positively signed-out account and retains its diagnostic", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("gemini-web", { cookies: [], origins: [] });
		const context = authenticatedContext();
		(browser as any).ensureContext = vi.fn(async () => ({ context, accountRevision: 1 }));
		(browser as any).trackContext = vi.fn(() => () => {});
		(browser as any).activePage = vi.fn(async () => ({
			goto: vi.fn(async () => {}),
			url: () => "https://accounts.google.com/signin",
		}));
		(browser as any).assessAuthentication = vi.fn(async () => ({
			state: "signed-out",
			evidence: "login-url",
		}));
		(browser as any).closeBrowser = vi.fn(async () => {});

		await expect(browser.chat("gemini-web", request("session"))).rejects.toMatchObject({ kind: "login_required" });
		expect((browser as any).accounts.inspect("gemini-web")).toMatchObject({
			state: "reauth-required",
			account: { reauthDiagnostic: { evidence: "login-url" } },
		});
		expect((browser as any).scheduler("gemini-web").currentGeneration()).toBe(1);
		await browser.dispose();
	});

	it("commits an authenticated snapshot after a recoverable failed turn", async () => {
		const browser = manager();
		const original = { cookies: [], origins: [] };
		const refreshed = { cookies: [], origins: [{ origin: "https://chatgpt.com", localStorage: [] }] };
		(browser as any).accounts.writeReady("chatgpt-web", original);
		const revision = (browser as any).accounts.inspect("chatgpt-web").account.revision;
		(browser as any).assessAuthentication = vi.fn(async () => ({
			state: "authenticated",
			evidence: "authenticated-surface",
		}));
		const lease = { generation: 0, signal: new AbortController().signal };

		await (browser as any).recoverAuthenticatedSnapshot(
			"chatgpt-web",
			{},
			{ storageState: vi.fn(async () => refreshed) },
			lease,
			revision,
		);
		expect((browser as any).accounts.inspect("chatgpt-web").account.storageState).toEqual(refreshed);
		await browser.dispose();
	});

	it("does not invalidate the scheduler when a stale revision rejects reauth", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("gemini-web", { cookies: [], origins: [] });
		const revision = (browser as any).accounts.inspect("gemini-web").account.revision;
		// Simulate a newer login replacing the account after this lease was bootstrapped.
		(browser as any).accounts.writeReady("gemini-web", {
			cookies: [],
			origins: [{ origin: "https://newer", localStorage: [] }],
		});
		const staleLease = { generation: 0, signal: new AbortController().signal };
		await (browser as any).handleSignedOut("gemini-web", staleLease, revision, "login-url");
		expect((browser as any).accounts.inspect("gemini-web").state).toBe("ready");
		expect((browser as any).scheduler("gemini-web").currentGeneration()).toBe(0);
		await browser.dispose();
	});

	it("marks reauth when catch-path recovery detects sign-out", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("chatgpt-web", { cookies: [], origins: [] });
		const revision = (browser as any).accounts.inspect("chatgpt-web").account.revision;
		const context = authenticatedContext();
		const page = { goto: vi.fn(async () => {}), url: () => "https://chatgpt.com/" };
		const lease = { generation: 0, signal: new AbortController().signal };
		(browser as any).assessAuthentication = vi.fn(async () => ({
			state: "signed-out",
			evidence: "login-url",
		}));
		(browser as any).closeBrowser = vi.fn(async () => {});

		await (browser as any).recoverAuthenticatedSnapshot("chatgpt-web", page, context, lease, revision);
		expect((browser as any).accounts.inspect("chatgpt-web").state).toBe("reauth-required");
		expect((browser as any).scheduler("chatgpt-web").currentGeneration()).toBe(1);
		await browser.dispose();
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
		expect(start.mock.calls[0]?.[0].port).toBe(39_000);
		await browser.dispose();
		expect(remote.session.dispose).toHaveBeenCalledTimes(1);
	});

	it("serializes remote finalization through the canonical profile pipeline", async () => {
		const browser = manager();
		(browser as any).display.hasInteractiveDisplay = vi.fn(() => false);
		const persist = vi.spyOn(browser as any, "persistLoginProfile").mockResolvedValue(undefined);
		const remote = remoteFixture();
		let finalize: (() => Promise<void>) | undefined;
		let port: number | undefined;
		vi.spyOn(RemoteLoginSession, "start").mockImplementation(async (options) => {
			finalize = options.finalize;
			port = options.port;
			return remote.session as any;
		});
		await browser.login("gemini-web");
		expect(port).toBe(39_001);
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
