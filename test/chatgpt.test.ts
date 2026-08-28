import type { Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import {
	CHATGPT_COMPOSER_SELECTOR,
	CHATGPT_EFFORT_MENU_SELECTOR,
	CHATGPT_EFFORT_SLIDER_SELECTOR,
	CHATGPT_STOP_BUTTON_SELECTOR,
	CHATGPT_THINKING_LEVEL_INDEX,
	chatgptLastAssistantTurnText,
	chatgptSelectThinkingLevel,
	chatgptSend,
	chatgptSnapshot,
	parseChatGptEffortSliderState,
} from "#internet/browser/chatgpt";

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

function fakeThinkingPickerPage(initialLevel: "Instant" | "Medium" | "High" = "Instant"): {
	page: Page;
	effortChoiceIndex: ReturnType<typeof vi.fn>;
	effortChoicePress: ReturnType<typeof vi.fn>;
	closePicker: ReturnType<typeof vi.fn>;
} {
	const labels = ["Instant", "Medium", "High"] as const;
	let selectedLevel = initialLevel;
	const effortChoicePress = vi.fn(async function (this: { index: number }) {
		selectedLevel = labels[this.index] ?? selectedLevel;
	});
	const effortChoiceIndex = vi.fn((index: number) => ({
		waitFor: vi.fn(async () => {}),
		press: effortChoicePress.bind({ index }),
	}));
	const effortMenu = {
		isVisible: vi.fn(async () => true),
		locator: vi.fn(() => ({ nth: effortChoiceIndex, count: async () => 3 })),
	};
	const effortControl = {
		waitFor: vi.fn(async () => {}),
		getAttribute: vi.fn(async () => "true"),
		innerText: vi.fn(async () => selectedLevel),
		press: vi.fn(async () => {}),
	};
	const composer = {
		locator: vi.fn(() => ({ locator: vi.fn(() => ({ last: () => effortControl })) })),
	};
	const closePicker = vi.fn(async () => {});
	const page = {
		locator(selector: string) {
			if (selector === CHATGPT_COMPOSER_SELECTOR) return { filter: () => ({ first: () => composer }) };
			if (selector === CHATGPT_EFFORT_MENU_SELECTOR) return { last: () => effortMenu };
			if (selector === CHATGPT_EFFORT_SLIDER_SELECTOR) {
				return { filter: () => ({ last: () => ({ waitFor: () => new Promise<never>(() => {}) }) }) };
			}
			throw new Error(`unexpected selector ${selector}`);
		},
		keyboard: { press: closePicker },
	} as unknown as Page;
	return { page, effortChoiceIndex, effortChoicePress, closePicker };
}

describe("chatgptSend", () => {
	it("keyboard-activates the ready send button", async () => {
		const fill = vi.fn(async () => {});
		const press = vi.fn(async () => {});
		const sendButton = {
			waitFor: vi.fn(async () => {}),
			isEnabled: vi.fn(async () => true),
			press,
		};
		const composer = { fill };
		const page = {
			locator: (selector: string) =>
				selector === CHATGPT_COMPOSER_SELECTOR
					? { filter: () => ({ first: () => composer }) }
					: { filter: () => ({ last: () => sendButton }) },
		} as unknown as Page;

		await chatgptSend(page, "hello");

		expect(fill).toHaveBeenNthCalledWith(1, "");
		expect(fill).toHaveBeenNthCalledWith(2, "hello");
		expect(press).toHaveBeenCalledWith("Enter");
	});
});

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

describe("CHATGPT_THINKING_LEVEL_INDEX", () => {
	it("maps the three supported thinking levels to their UI indexes", () => {
		expect(CHATGPT_THINKING_LEVEL_INDEX).toEqual({ instant: 0, medium: 1, high: 2 });
	});
});

describe("chatgptSelectThinkingLevel", () => {
	it("selects and verifies Medium before a turn", async () => {
		const { page, effortChoiceIndex, effortChoicePress, closePicker } = fakeThinkingPickerPage();
		await chatgptSelectThinkingLevel(page, "medium");
		expect(effortChoiceIndex).toHaveBeenCalledWith(1);
		expect(effortChoicePress).toHaveBeenCalledWith("Enter");
		expect(closePicker).toHaveBeenCalledWith("Escape");
	});

	it("does not bypass the picker for an explicit Instant override", async () => {
		const { page, effortChoiceIndex, effortChoicePress, closePicker } = fakeThinkingPickerPage("Medium");
		await chatgptSelectThinkingLevel(page, "instant");
		expect(effortChoiceIndex).toHaveBeenCalledWith(0);
		expect(effortChoicePress).toHaveBeenCalledWith("Enter");
		expect(closePicker).toHaveBeenCalledWith("Escape");
	});
});

describe("parseChatGptEffortSliderState", () => {
	it("parses the three-level ARIA range", () => {
		expect(parseChatGptEffortSliderState("0", "2", "1")).toEqual({ min: 0, max: 2, value: 1 });
	});

	it("returns undefined for non-integer or missing attributes", () => {
		expect(parseChatGptEffortSliderState(null, "4", "1")).toBeUndefined();
		expect(parseChatGptEffortSliderState("0", "4", null)).toBeUndefined();
		expect(parseChatGptEffortSliderState("0.5", "4", "1")).toBeUndefined();
		expect(parseChatGptEffortSliderState("0", "4", "x")).toBeUndefined();
	});

	it("returns undefined when the value is outside the range", () => {
		expect(parseChatGptEffortSliderState("0", "4", "5")).toBeUndefined();
		expect(parseChatGptEffortSliderState("0", "4", "-1")).toBeUndefined();
	});

	it("returns undefined when the slider exposes unsupported levels", () => {
		expect(parseChatGptEffortSliderState("0", "3", "1")).toBeUndefined();
	});
});
