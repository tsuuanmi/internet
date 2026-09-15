import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	hashProviderTurnText,
	ProviderTurnReceiptStore,
	reconcileProviderTurn,
} from "#internet/browser/turn-receipts";

const roots: string[] = [];

function store(): ProviderTurnReceiptStore {
	const root = mkdtempSync(join(tmpdir(), "internet-turn-receipt-"));
	roots.push(root);
	return new ProviderTurnReceiptStore(root, "chatgpt-thinker");
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProviderTurnReceiptStore", () => {
	it("persists one submitted logical request and rejects request-key drift", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "workflow-session",
			requestKey: "job:node:input",
			prompt: "first prompt",
			previousResponse: "old response",
			conversationUrl: "https://chatgpt.com/c/example",
		});

		expect(receipts.read("workflow-session", "job:node:input")).toEqual(submitted);
		expect(() =>
			receipts.submit({
				sessionId: "workflow-session",
				requestKey: "job:node:input",
				prompt: "different prompt",
				previousResponse: "old response",
			}),
		).toThrow("different prompt");
	});

	it("waits for a submitted live generation without resubmitting", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "workflow-session",
			requestKey: "job:node:input",
			prompt: "prompt",
			previousResponse: "old response",
		});

		expect(reconcileProviderTurn(submitted, { text: "partial response", running: true })).toBe("WAIT");
	});

	it("recovers a late provider response and completes the same logical receipt", () => {
		const receipts = store();
		const submitted = receipts.submit({
			sessionId: "workflow-session",
			requestKey: "job:node:input",
			prompt: "prompt",
			previousResponse: "old response",
		});
		expect(reconcileProviderTurn(submitted, { text: "late completed response", running: false })).toBe("RECOVER");

		const completed = receipts.complete(
			"workflow-session",
			"job:node:input",
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
			sessionId: "workflow-session",
			requestKey: "job:node:input",
			prompt: "prompt",
			previousResponse: "old response",
		});

		expect(reconcileProviderTurn(submitted, { text: "old response", running: false })).toBe("RESUBMIT");
	});

	it("fails closed when a completed receipt no longer matches provider conversation state", () => {
		const receipts = store();
		receipts.submit({
			sessionId: "workflow-session",
			requestKey: "job:node:input",
			prompt: "prompt",
			previousResponse: "old response",
		});
		const completed = receipts.complete(
			"workflow-session",
			"job:node:input",
			"expected response",
			"https://chatgpt.com/c/example",
		);

		expect(reconcileProviderTurn(completed, { text: "different response", running: false })).toBe("AMBIGUOUS");
		expect(() =>
			receipts.complete(
				"workflow-session",
				"job:node:input",
				"conflicting response",
				"https://chatgpt.com/c/example",
			),
		).toThrow("conflicting response");
	});
});
