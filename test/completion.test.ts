import { describe, expect, it } from "vitest";
import type { CompletionSnapshot } from "#internet/browser/completion";
import { waitForStableCompletion } from "#internet/browser/completion";

function snapshot(text: string, running: boolean, html = `<p>${text}</p>`): CompletionSnapshot {
	return { responsePresent: true, text, html, running };
}

describe("waitForStableCompletion", () => {
	it("returns markdown once the response is present and stable while not running", async () => {
		let calls = 0;
		const text = await waitForStableCompletion(
			async () => {
				calls += 1;
				if (calls < 5) return snapshot("Thinking...", true);
				return snapshot("Final answer", false);
			},
			{ timeoutMs: 2000, pollMs: 5, stableMs: 20 },
		);
		expect(text).toContain("Final answer");
	});

	it("throws a timeout error when the response never stabilizes", async () => {
		let calls = 0;
		await expect(
			waitForStableCompletion(
				async () => {
					calls += 1;
					return calls % 2 === 0 ? snapshot("A", false) : snapshot("B", false);
				},
				{ timeoutMs: 80, pollMs: 5, stableMs: 2000 },
			),
		).rejects.toThrow(/did not complete/);
	});

	it("never completes while generation is running even if text is unchanged", async () => {
		await expect(
			waitForStableCompletion(async () => snapshot("same", true), { timeoutMs: 60, pollMs: 5, stableMs: 20 }),
		).rejects.toThrow(/did not complete/);
	});

	it("rejects when aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			waitForStableCompletion(async () => snapshot("x", false), {
				timeoutMs: 2000,
				pollMs: 5,
				stableMs: 20,
				signal: controller.signal,
			}),
		).rejects.toThrow();
	});
});
