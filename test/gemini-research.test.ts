import type { Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import { geminiStartResearchPlan } from "#internet/browser/gemini-research";

describe("geminiStartResearchPlan", () => {
	it("treats an existing research report as an already-activated plan", async () => {
		const press = vi.fn();
		const page = {
			locator: (selector: string) => {
				if (selector === 'button[aria-label="Start research"]') {
					return {
						filter: () => ({
							last: () => ({
								isVisible: vi.fn(async () => false),
								isDisabled: vi.fn(async () => false),
								press,
							}),
						}),
					};
				}
				if (selector === 'div[data-test-id="deep-research-report"]') {
					return { filter: () => ({ count: vi.fn(async () => 1) }) };
				}
				throw new Error(`unexpected selector ${selector}`);
			},
		} as unknown as Page;

		await expect(geminiStartResearchPlan(page, { timeoutMs: 1_000 })).resolves.toBeUndefined();
		expect(press).not.toHaveBeenCalled();
	});
});
