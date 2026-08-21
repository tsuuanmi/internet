import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { CHATGPT_STOP_BUTTON_SELECTOR, chatgptLastAssistantTurnText, chatgptSnapshot } from "#internet/browser/chatgpt";

function fakePage(turns: string[]): { page: Page } {
	const turn = (index: number) => ({
		innerText: async () => turns[index] ?? "",
		innerHTML: async () => `<p>${turns[index] ?? ""}</p>`,
	});
	const page = {
		locator(selector: string) {
			if (selector === CHATGPT_STOP_BUTTON_SELECTOR) {
				return { filter: () => ({ count: async () => 0 }) };
			}
			return {
				filter: () => ({
					count: async () => turns.length,
					last: () => turn(turns.length - 1),
				}),
			};
		},
	} as unknown as Page;
	return { page };
}

describe("chatgptLastAssistantTurnText", () => {
	it("returns the newest turn text, or empty when none", async () => {
		expect(await chatgptLastAssistantTurnText(fakePage([]).page)).toBe("");
		expect(await chatgptLastAssistantTurnText(fakePage(["old answer"]).page)).toBe("old answer");
	});
});

describe("chatgptSnapshot", () => {
	it("is not present when the newest turn still equals the previous turn text", async () => {
		const { page } = fakePage(["old answer"]);
		expect(await chatgptSnapshot(page, "old answer")).toMatchObject({
			responsePresent: false,
			text: "old answer",
			running: false,
		});
	});

	it("is present once the newest assistant turn differs from the previous turn", async () => {
		const { page } = fakePage(["old answer", "new answer"]);
		expect(await chatgptSnapshot(page, "old answer")).toMatchObject({
			responsePresent: true,
			text: "new answer",
			running: false,
		});
	});

	it("treats any non-empty turn as present when there is no previous turn", async () => {
		const { page } = fakePage(["first answer"]);
		expect(await chatgptSnapshot(page)).toMatchObject({ responsePresent: true, text: "first answer" });
	});
});
