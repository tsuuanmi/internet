import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	hashProviderTurnText,
	ProviderTurnReceiptStore,
	providerTurnReceiptId,
	reconcileProviderTurn,
} from "#internet/browser/turn-receipts";

const roots: string[] = [];
const requestId = "call-provider-42";

function store(accountId: "chatgpt-thinker" | "gemini-thinker" = "chatgpt-thinker"): ProviderTurnReceiptStore {
	const root = mkdtempSync(join(tmpdir(), "internet-turn-receipt-"));
	roots.push(root);
	return new ProviderTurnReceiptStore(root, accountId);
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProviderTurnReceiptStore", () => {
	it("derives identity from account, owning session, and provider request id", () => {
		const first = providerTurnReceiptId("chatgpt-thinker", "session-a", requestId);
		expect(first).toMatch(/^[0-9a-f]{64}$/u);
		expect(providerTurnReceiptId("chatgpt-thinker", "session-b", requestId)).not.toBe(first);
		expect(providerTurnReceiptId("gemini-thinker", "session-a", requestId)).not.toBe(first);
		expect(providerTurnReceiptId("chatgpt-thinker", "session-a", "call-provider-43")).not.toBe(first);
		expect(() => providerTurnReceiptId("chatgpt-thinker", "", requestId)).toThrow("session id");
		expect(() => providerTurnReceiptId("chatgpt-thinker", "session-a", "")).toThrow("request id");
	});

	it("persists one submitted logical request and rejects request-id drift", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "teammate-session",
			requestId,
			prompt: "first prompt",
			previousResponse: "old response",
			conversationUrl: "https://chatgpt.com/c/example",
		});

		expect(receipts.read("teammate-session", requestId)).toEqual(submitted);
		expect(submitted.accountId).toBe("chatgpt-thinker");
		expect(submitted).not.toHaveProperty("workflowJobId");
		expect(() =>
			receipts.submit({
				sessionId: "teammate-session",
				requestId,
				prompt: "different prompt",
				previousResponse: "old response",
			}),
		).toThrow("different prompt");
	});

	it("waits for a submitted live generation without resubmitting", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "teammate-session",
			requestId,
			prompt: "prompt",
			previousResponse: "old response",
		});

		expect(reconcileProviderTurn(submitted, { text: "partial response", running: true })).toBe("WAIT");
	});

	it("recovers a late provider response and completes the same logical receipt", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "teammate-session",
			requestId,
			prompt: "prompt",
			previousResponse: "old response",
		});
		expect(reconcileProviderTurn(submitted, { text: "late completed response", running: false })).toBe("RECOVER");

		const completed = receipts.complete(
			"teammate-session",
			requestId,
			"late completed response",
			"https://chatgpt.com/c/example",
		);
		expect(completed).toMatchObject({
			status: "COMPLETED",
			responseHash: hashProviderTurnText("late completed response"),
		});
		expect(reconcileProviderTurn(completed, { text: "late completed response", running: false })).toBe("RECOVER");
	});

	it("uses the explicit bounded resubmit boundary only when no active or new response exists", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "teammate-session",
			requestId,
			prompt: "prompt",
			previousResponse: "old response",
		});

		expect(reconcileProviderTurn(submitted, { text: "old response", running: false })).toBe("RESUBMIT");
	});

	it("fails closed when a completed receipt no longer matches provider conversation state", () => {
		const receipts = store();
		receipts.submit({
			sessionId: "teammate-session",
			requestId,
			prompt: "prompt",
			previousResponse: "old response",
		});
		const completed = receipts.complete(
			"teammate-session",
			requestId,
			"expected response",
			"https://chatgpt.com/c/example",
		);

		expect(reconcileProviderTurn(completed, { text: "different response", running: false })).toBe("AMBIGUOUS");
		expect(() =>
			receipts.complete("teammate-session", requestId, "conflicting response", "https://chatgpt.com/c/example"),
		).toThrow("conflicting response");
	});
});
