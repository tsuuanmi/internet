import type { Locator } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import { waitForSendReady } from "#internet/browser/submission";

describe("waitForSendReady", () => {
	it("waits through transient disabled states", async () => {
		const button = {
			waitFor: vi.fn(async () => {}),
			isEnabled: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
		} as unknown as Locator;
		await waitForSendReady("Provider", button, 1000);
		expect(button.isEnabled).toHaveBeenCalledTimes(2);
	});

	it("fails actionably when the button never enables", async () => {
		const button = {
			waitFor: vi.fn(async () => {}),
			isEnabled: vi.fn(async () => false),
		} as unknown as Locator;
		await expect(waitForSendReady("Provider", button, 10)).rejects.toThrow(/did not become enabled/);
	});
});
