import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as chatgpt from "#internet/browser/chatgpt";
import * as chatgptResearch from "#internet/browser/chatgpt-research";
import { ConversationStore } from "#internet/browser/conversations";
import * as gemini from "#internet/browser/gemini";
import * as geminiResearch from "#internet/browser/gemini-research";
import { BrowserManager, waitForBoundCompletion } from "#internet/browser/runtime";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";

// Vitest's clock does not replace node:timers/promises; route that API through
// the fake global clock while retaining abort rejection/listener cleanup.
vi.mock("node:timers/promises", () => ({
	setTimeout: (ms: number, value: unknown, options: { signal?: AbortSignal } = {}) =>
		new Promise((resolve, reject) => {
			const signal = options.signal;
			const abort = () => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				reject(new Error("The operation was aborted"));
			};
			const timer = setTimeout(() => {
				signal?.removeEventListener("abort", abort);
				resolve(value);
			}, ms);
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
		}),
}));

const roots: string[] = [];
const providers = ["chatgpt-web", "gemini-web"] as const;
const canonical = (provider: WebProvider) =>
	provider === "chatgpt-web" ? "https://chatgpt.com/c/native" : "https://gemini.google.com/app/native";
const home = (provider: WebProvider) =>
	provider === "chatgpt-web" ? "https://chatgpt.com/" : "https://gemini.google.com/app";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(provider: WebProvider, urlAt: number, completeAt: number, timeoutMs = 90_000, signal?: AbortSignal) {
	const persist = vi.fn((url: string) => url);
	const observe = vi.fn(async (localSignal: AbortSignal) => {
		await delay(completeAt, undefined, { signal: localSignal });
		return "answer";
	});
	const url = vi.fn(() => (Date.now() >= urlAt ? canonical(provider) : home(provider)));
	const result = waitForBoundCompletion({ provider, page: { url }, persist, observe, timeoutMs, signal });
	// Attach rejection ownership before advancing fake time.
	const outcome = result.then(
		(value) => ({ value }),
		(error) => ({ error }),
	);
	return { persist, observe, url, outcome };
}

describe.each(providers)("%s canonical binding", (provider) => {
	it("observes immediately and binds after 30 seconds while generation continues", async () => {
		const turn = run(provider, 35_000, 40_000);
		expect(turn.observe).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(30_100);
		expect(turn.persist).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(turn.persist).toHaveBeenCalledWith(canonical(provider));
		await vi.advanceTimersByTimeAsync(4_900);
		expect(await turn.outcome).toEqual({ value: { text: "answer", binding: canonical(provider) } });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("allows a short URL grace after completion", async () => {
		const turn = run(provider, 3_000, 1_000);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(await turn.outcome).toEqual({ value: { text: "answer", binding: canonical(provider) } });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("fails missing canonical URL after a bounded completion grace", async () => {
		const turn = run(provider, Infinity, 1_000);
		await vi.advanceTimersByTimeAsync(6_000);
		expect(await turn.outcome).toMatchObject({
			error: { kind: "provider_error", message: expect.stringContaining("canonical conversation URL") },
		});
		const reads = turn.url.mock.calls.length;
		await vi.advanceTimersByTimeAsync(20_000);
		expect(turn.url).toHaveBeenCalledTimes(reads);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("caps the completion grace at the overall deadline", async () => {
		const turn = run(provider, Infinity, 4_000, 5_000);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await turn.outcome).toMatchObject({ error: { kind: "timeout" } });
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([500, 2_000])("cancels without orphan polling at %ims", async (abortAt) => {
		const controller = new AbortController();
		const reason = new Error("cancelled");
		const turn = run(provider, Infinity, 1_000, 90_000, controller.signal);
		await vi.advanceTimersByTimeAsync(abortAt);
		controller.abort(reason);
		expect(await turn.outcome).toEqual({ error: reason });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves observer failure and stops URL polling before binding", async () => {
		const error = new Error("provider execution failed");
		const url = vi.fn(() => home(provider));
		const persist = vi.fn();
		await expect(
			waitForBoundCompletion({
				provider,
				page: { url },
				timeoutMs: 90_000,
				persist,
				observe: async () => {
					throw error;
				},
			}),
		).rejects.toBe(error);
		expect(persist).not.toHaveBeenCalled();
		const reads = url.mock.calls.length;
		await vi.advanceTimersByTimeAsync(90_000);
		expect(url).toHaveBeenCalledTimes(reads);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves persistence errors and joins the running observer", async () => {
		const error = new Error("disk unavailable");
		let stopped = false;
		const turn = waitForBoundCompletion({
			provider,
			page: { url: () => canonical(provider) },
			timeoutMs: 90_000,
			persist: () => {
				throw error;
			},
			observe: async (signal) => {
				try {
					await delay(80_000, undefined, { signal });
					return "answer";
				} finally {
					stopped = true;
				}
			},
		});
		await expect(turn).rejects.toBe(error);
		expect(stopped).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});

function runtime(provider: WebProvider, research = false) {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-binding-"));
	roots.push(dataDir);
	const manager = new BrowserManager(
		resolveBrowserConfig({ dataDir, pollMs: 1_000, stableMs: 1, turnTimeoutMs: 30_000 }),
	);
	const controller = new AbortController();
	const page = { url: vi.fn((): string => home(provider)), goto: vi.fn() };
	const context = { close: vi.fn(async () => {}) };
	const internals = manager as any;
	internals.ensureContext = vi.fn(async () => ({ context, accountRevision: 1, storageState: {} }));
	internals.trackContext = vi.fn(() => () => {});
	internals.activePage = vi.fn(async () => page);
	internals.assessAuthentication = vi.fn(async () => ({ state: "authenticated" }));
	internals.captureAccountSnapshot = vi.fn(async () => ({}));
	internals.commitAccountSnapshot = vi.fn(async () => {});
	internals.recoverAuthenticatedSnapshot = vi.fn(async () => {});
	const snapshot = vi.fn(async () => ({
		responsePresent: true,
		text: "answer",
		html: "",
		running: Date.now() < 40_000,
	}));
	vi.spyOn(chatgpt, "chatgptLastAssistantTurnText").mockResolvedValue("");
	vi.spyOn(chatgpt, "chatgptSelectThinkingLevel").mockResolvedValue(undefined);
	vi.spyOn(chatgpt, "chatgptSend").mockResolvedValue(undefined);
	vi.spyOn(chatgpt, "chatgptSnapshot").mockImplementation(snapshot);
	vi.spyOn(chatgptResearch, "chatgptEnableDeepResearch").mockResolvedValue(undefined);
	vi.spyOn(chatgptResearch, "chatgptSendDeepResearch").mockResolvedValue(undefined);
	vi.spyOn(chatgptResearch, "chatgptDeepResearchSnapshot").mockImplementation(snapshot);
	vi.spyOn(gemini, "geminiLastResponseText").mockResolvedValue("");
	vi.spyOn(gemini, "geminiLastDeepResearchReportText").mockResolvedValue("");
	vi.spyOn(gemini, "geminiSelectDefaultMode").mockResolvedValue(undefined);
	vi.spyOn(gemini, "geminiSend").mockResolvedValue(undefined);
	vi.spyOn(gemini, "geminiSnapshot").mockImplementation(snapshot);
	vi.spyOn(gemini, "geminiDeepResearchSnapshot").mockImplementation(snapshot);
	vi.spyOn(geminiResearch, "geminiEnableDeepResearch").mockResolvedValue(undefined);
	const plan = vi.spyOn(geminiResearch, "geminiStartResearchPlan").mockResolvedValue(undefined);
	const accountId = provider === "chatgpt-web" ? "chatgpt-thinker" : "gemini-thinker";
	const store = new ConversationStore(dataDir, accountId);
	const start = () =>
		internals
			.chatAccount(
				accountId,
				{ prompt: "test", sessionId: "session", research, timeoutMs: 90_000 },
				{ signal: controller.signal },
			)
			.then(
				(value: unknown) => ({ value }),
				(error: unknown) => ({ error }),
			);
	return { start, store, page, controller, snapshot, context, plan };
}

describe.each(providers)("%s runtime wiring", (provider) => {
	it("uses request timeout and observes before a delayed canonical URL", async () => {
		const turn = runtime(provider);
		turn.page.url.mockImplementation(() => (Date.now() >= 35_000 ? canonical(provider) : home(provider)));
		const outcome = turn.start();
		await vi.advanceTimersByTimeAsync(30_100);
		expect(turn.snapshot).toHaveBeenCalled();
		expect(turn.context.close).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await outcome).toMatchObject({
			value: { text: "answer", conversationId: "native", url: canonical(provider) },
		});
		expect(turn.context.close).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("persists research binding before completion for cancellation recovery", async () => {
		const turn = runtime(provider, true);
		turn.page.url.mockImplementation(() => (Date.now() >= 1_000 ? canonical(provider) : home(provider)));
		if (provider === "gemini-web")
			turn.plan.mockImplementation(async (_page, options) => {
				await delay(50_000, undefined, { signal: options?.signal });
			});
		const outcome = turn.start();
		await vi.advanceTimersByTimeAsync(2_000);
		if (provider === "gemini-web") expect(turn.plan).toHaveBeenCalledTimes(1);
		expect(turn.store.read("session")?.conversationUrl).toBe(canonical(provider));
		const reason = new Error("research cancelled");
		turn.controller.abort(reason);
		expect(await outcome).toEqual({ error: reason });
		expect(turn.store.read("session")?.conversationId).toBe("native");
		expect(vi.getTimerCount()).toBe(0);
	});
});
