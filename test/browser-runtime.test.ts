import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AccountStatus, BrowserManager, type ChatRequest, type ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { resolveBrowserConfig } from "#internet/core/config";

const roots: string[] = [];

function manager(overrides: Record<string, unknown> = {}): BrowserManager {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-runtime-"));
	roots.push(dataDir);
	return new BrowserManager(resolveBrowserConfig({ dataDir, ...overrides }));
}

function request(sessionId: string, visible = false): ChatRequest {
	return { prompt: "test", sessionId, ...(visible ? { visible: true } : {}) };
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("BrowserManager account serialization", () => {
	it("serializes lifecycle operations for the same account", async () => {
		const browser = manager();
		const releases: Array<() => void> = [];
		let active = 0;
		let maximum = 0;
		(browser as any).loginAccount = vi.fn(async (accountId: AccountId): Promise<AccountStatus> => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return { accountId, provider: "chatgpt-web", state: "ready", accountPath: "/account" };
		});

		const first = browser.login("chatgpt-thinker");
		const second = browser.login("chatgpt-thinker");
		await vi.waitFor(() => expect((browser as any).loginAccount).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).loginAccount).toHaveBeenCalledTimes(2));
		expect(maximum).toBe(1);
		releases.shift()?.();
		await Promise.all([first, second]);
		await browser.dispose();
	});

	it("gives thinker and writer independent schedulers even though both use ChatGPT", async () => {
		const browser = manager();
		expect((browser as any).scheduler("chatgpt-thinker")).not.toBe((browser as any).scheduler("chatgpt-writer"));
		expect((browser as any).provider("chatgpt-thinker")).toBe("chatgpt-web");
		expect((browser as any).provider("chatgpt-writer")).toBe("chatgpt-web");
		await browser.dispose();
	});

	it("allows different accounts to run concurrently at capacity one", async () => {
		const browser = manager({ maxConcurrentTurnsPerAccount: 1 });
		const releases: Array<() => void> = [];
		let active = 0;
		let maximum = 0;
		(browser as any).chatAccount = vi.fn(async (): Promise<ChatResult> => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return { text: "ok", url: "https://example.com" };
		});

		const thinker = browser.chat("chatgpt-thinker", request("thinker"));
		const writer = browser.chat("chatgpt-writer", request("writer"));
		await vi.waitFor(() => expect((browser as any).chatAccount).toHaveBeenCalledTimes(2));
		expect(maximum).toBe(2);
		for (const release of releases.splice(0)) release();
		await Promise.all([thinker, writer]);
		await browser.dispose();
	});

	it("serializes same-session turns within one account", async () => {
		const browser = manager({ maxConcurrentTurnsPerAccount: 2 });
		const releases: Array<() => void> = [];
		(browser as any).chatAccount = vi.fn(async (): Promise<ChatResult> => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return { text: "ok", url: "https://example.com" };
		});

		const first = browser.chat("gemini-thinker", request("same"));
		const second = browser.chat("gemini-thinker", request("same"));
		await vi.waitFor(() => expect((browser as any).chatAccount).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).chatAccount).toHaveBeenCalledTimes(2));
		releases.shift()?.();
		await Promise.all([first, second]);
		await browser.dispose();
	});

	it("uses configured per-account hidden-turn capacity", async () => {
		const browser = manager({ maxConcurrentTurnsPerAccount: 2 });
		const releases: Array<() => void> = [];
		(browser as any).chatAccount = vi.fn(async (): Promise<ChatResult> => {
			await new Promise<void>((resolve) => releases.push(resolve));
			return { text: "ok", url: "https://example.com" };
		});

		const first = browser.chat("chatgpt-thinker", request("one"));
		const second = browser.chat("chatgpt-thinker", request("two"));
		const third = browser.chat("chatgpt-thinker", request("three"));
		await vi.waitFor(() => expect((browser as any).chatAccount).toHaveBeenCalledTimes(2));
		releases.shift()?.();
		await vi.waitFor(() => expect((browser as any).chatAccount).toHaveBeenCalledTimes(3));
		for (const release of releases.splice(0)) release();
		await Promise.all([first, second, third]);
		await browser.dispose();
	});
});

describe("BrowserManager login verification", () => {
	it("accepts a reopened ChatGPT profile from provider session proof without account-control DOM", async () => {
		const browser = manager();
		const page = {
			isClosed: () => false,
			url: () => "https://chatgpt.com/",
			evaluate: async () => ({ available: true, authenticated: true, status: 200 }),
			locator: () => ({ filter: () => ({ count: async () => 0 }) }),
		};
		const context = { pages: () => [page] };
		await expect((browser as any).waitForAuthenticatedPage("chatgpt-web", context, 50)).resolves.toBe(page);
		await browser.dispose();
	});
});

describe("BrowserManager account state boundaries", () => {
	it("commits concurrent snapshots against only the selected account revision", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("chatgpt-thinker", { cookies: [], origins: [] });
		(browser as any).accounts.writeReady("chatgpt-writer", { cookies: [], origins: [] });
		const thinkerRevision = (browser as any).accounts.inspect("chatgpt-thinker").account.revision;
		const writerRevision = (browser as any).accounts.inspect("chatgpt-writer").account.revision;
		const lease = { generation: 0, signal: new AbortController().signal };

		await (browser as any).commitAccountSnapshot("chatgpt-thinker", lease, thinkerRevision, {
			cookies: [],
			origins: [{ origin: "https://thinker.example", localStorage: [] }],
		});
		expect((browser as any).accounts.inspect("chatgpt-thinker").account.revision).toBe(thinkerRevision + 1);
		expect((browser as any).accounts.inspect("chatgpt-writer").account.revision).toBe(writerRevision);
		await browser.dispose();
	});

	it("invalidates only the positively signed-out account", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("chatgpt-thinker", { cookies: [], origins: [] });
		(browser as any).accounts.writeReady("chatgpt-writer", { cookies: [], origins: [] });
		const writerRevision = (browser as any).accounts.inspect("chatgpt-writer").account.revision;
		const lease = { generation: 0, signal: new AbortController().signal };
		(browser as any).closeBrowser = vi.fn(async () => {});

		await (browser as any).handleSignedOut("chatgpt-writer", lease, writerRevision, "login-url");
		expect((browser as any).accounts.inspect("chatgpt-writer").state).toBe("reauth-required");
		expect((browser as any).accounts.inspect("chatgpt-thinker").state).toBe("ready");
		expect((browser as any).scheduler("chatgpt-writer").currentGeneration()).toBe(1);
		expect((browser as any).scheduler("chatgpt-thinker").currentGeneration()).toBe(0);
		await browser.dispose();
	});

	it("returns account and provider together in status", async () => {
		const browser = manager();
		(browser as any).accounts.writeReady("gemini-thinker", { cookies: [], origins: [] });
		await expect(browser.status("gemini-thinker")).resolves.toMatchObject({
			accountId: "gemini-thinker",
			provider: "gemini-web",
			state: "ready",
		});
		await browser.dispose();
	});
});
