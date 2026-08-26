import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { GEMINI_STOP_BUTTON_SELECTOR, geminiLastResponseText, geminiSnapshot } from "#internet/browser/gemini";

function fakePage(responses: string[]): { page: Page } {
	const response = (index: number) => ({
		innerText: async () => responses[index] ?? "",
		innerHTML: async () => `<p>${responses[index] ?? ""}</p>`,
	});
	const page = {
		locator(selector: string) {
			if (selector === GEMINI_STOP_BUTTON_SELECTOR) {
				return { filter: () => ({ count: async () => 0 }) };
			}
			return {
				filter: () => ({
					count: async () => responses.length,
					last: () => response(responses.length - 1),
				}),
			};
		},
	} as unknown as Page;
	return { page };
}

describe("geminiLastResponseText", () => {
	it("returns the newest response text, or empty when none", async () => {
		expect(await geminiLastResponseText(fakePage([]).page)).toBe("");
		expect(await geminiLastResponseText(fakePage(["old answer"]).page)).toBe("old answer");
	});
});

describe("geminiSnapshot", () => {
	it("is not present when the newest response still equals the previous turn text", async () => {
		const { page } = fakePage(["old answer"]);
		expect(await geminiSnapshot(page, "old answer")).toMatchObject({
			responsePresent: false,
			text: "old answer",
			running: false,
		});
	});

	it("is present once the newest response differs from the previous turn", async () => {
		const { page } = fakePage(["old answer", "new answer"]);
		expect(await geminiSnapshot(page, "old answer")).toMatchObject({
			responsePresent: true,
			text: "new answer",
			running: false,
		});
	});

	it("treats any non-empty response as present when there is no previous turn", async () => {
		const { page } = fakePage(["first answer"]);
		expect(await geminiSnapshot(page)).toMatchObject({ responsePresent: true, text: "first answer" });
	});
});
