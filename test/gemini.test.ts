import type { Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import {
	GEMINI_ACCOUNT_SELECTOR,
	GEMINI_COMPOSER_SELECTOR,
	GEMINI_MODE_MENU_ITEM_SELECTOR,
	GEMINI_MODE_PICKER_SELECTOR,
	GEMINI_RESPONSE_SELECTOR,
	GEMINI_STOP_BUTTON_SELECTOR,
	geminiAuthenticationAssessment,
	geminiLastResponseText,
	geminiSelectDefaultMode,
	geminiSend,
	geminiSnapshot,
	geminiWaitAuthenticationAssessment,
} from "#internet/browser/gemini";

interface ResponseFixture {
	text?: string;
	errorSurface?: boolean;
	retry?: string;
	quoted?: boolean;
}

function fakePage(values: (string | ResponseFixture)[], running = false): { page: Page } {
	const responses = values.map((value) => (typeof value === "string" ? { text: value } : value));
	const collection = (count: number, last?: unknown) => ({
		count: async () => count,
		last: () => last,
		nth: (index: number) => {
			expect(index).toBe(count - 1);
			return last;
		},
		filter: () => collection(count, last),
		and: () => collection(count, last),
	});
	const response = (value: ResponseFixture) => ({
		innerText: async () => value.text ?? "",
		innerHTML: async () => `<p>${value.text ?? ""}</p>`,
		locator: (selector: string) => {
			expect(selector).toBe("blockquote, pre, code, q");
			return collection(value.quoted ? 1 : 0);
		},
	});
	const container = (value: ResponseFixture) => ({
		locator: (selector: string) => {
			if (selector === ".model-response-text message-content .markdown.markdown-main-panel")
				return collection(value.text === undefined ? 0 : 1, response(value));
			if (selector === ":not(message-content *)") return collection(1);
			expect(selector).toContain("response-error:not(message-content *)");
			return collection(value.errorSurface ? 1 : 0);
		},
		getByRole: (role: string, options: { name: RegExp }) => {
			expect(role).toBe("button");
			return collection(value.retry && options.name.test(value.retry) ? 1 : 0);
		},
	});
	const newest = responses.at(-1);
	const page = {
		locator(selector: string) {
			if (selector === GEMINI_STOP_BUTTON_SELECTOR) return collection(running ? 1 : 0);
			if (selector === "model-response") return collection(responses.length, newest && container(newest));
			expect(selector).toBe(GEMINI_RESPONSE_SELECTOR);
			return collection(responses.length, newest && response(newest));
		},
	} as unknown as Page;
	return { page };
}

function authenticationPage(url: string, composerCount = 0, accountCount = 0): Page {
	return {
		url: () => url,
		locator(selector: string) {
			const count =
				selector === GEMINI_COMPOSER_SELECTOR
					? composerCount
					: selector === GEMINI_ACCOUNT_SELECTOR
						? accountCount
						: 0;
			return { filter: () => ({ count: async () => count }) };
		},
	} as unknown as Page;
}

describe("geminiAuthenticationAssessment", () => {
	it("distinguishes authenticated, signed-out, challenge, and unconfirmed pages", async () => {
		await expect(
			geminiAuthenticationAssessment(authenticationPage("https://gemini.google.com/app", 1, 1)),
		).resolves.toMatchObject({
			state: "authenticated",
			evidence: "authenticated-surface",
		});
		await expect(
			geminiAuthenticationAssessment(
				authenticationPage("https://accounts.google.com/v3/signin/identifier?continue=secret"),
			),
		).resolves.toEqual({
			state: "signed-out",
			evidence: "login-url",
		});
		await expect(
			geminiAuthenticationAssessment(authenticationPage("https://accounts.google.com/v3/signin/challenge")),
		).resolves.toMatchObject({
			state: "challenge",
			evidence: "challenge-url",
		});
		await expect(
			geminiAuthenticationAssessment(authenticationPage("https://gemini.google.com/loading")),
		).resolves.toMatchObject({
			state: "unconfirmed",
			evidence: "timeout",
		});
	});
});

describe("geminiWaitAuthenticationAssessment", () => {
	it("retains a challenge over an earlier signed-out observation", async () => {
		const urls = ["https://accounts.google.com/v3/signin", "https://accounts.google.com/v3/signin/challenge"];
		let index = 0;
		const page = {
			url: () => urls[Math.min(index, urls.length - 1)] ?? "",
			locator: () => ({ filter: () => ({ count: async () => 0 }) }),
		} as unknown as Page;
		vi.spyOn(await import("#internet/core/sleep"), "sleep").mockImplementation(async () => {
			index += 1;
		});
		const assessment = await geminiWaitAuthenticationAssessment(page, 600, undefined);
		expect(assessment.state).toBe("challenge");
	});

	it("recognizes a final signed-out page after an earlier challenge", async () => {
		const urls = ["https://accounts.google.com/v3/signin/challenge", "https://accounts.google.com/v3/signin"];
		let index = 0;
		const page = {
			url: () => urls[Math.min(index, urls.length - 1)] ?? "",
			locator: () => ({ filter: () => ({ count: async () => 0 }) }),
		} as unknown as Page;
		vi.spyOn(await import("#internet/core/sleep"), "sleep").mockImplementation(async () => {
			index += 1;
		});
		const assessment = await geminiWaitAuthenticationAssessment(page, 600, undefined);
		expect(assessment.state).toBe("signed-out");
	});
});

function modePickerPage(
	options: {
		delayedOpen?: boolean;
		duplicateFlash?: boolean;
		flashDisabled?: boolean;
		retainExtended?: boolean;
		staleExpandedOnce?: boolean;
	} = {},
): {
	page: Page;
	triggerClick: ReturnType<typeof vi.fn>;
	flashClick: ReturnType<typeof vi.fn>;
	flashLiteClick: ReturnType<typeof vi.fn>;
	extendedClick: ReturnType<typeof vi.fn>;
	nth: ReturnType<typeof vi.fn>;
} {
	let expanded = false;
	let pickerClicked = false;
	let delayedReads = 0;
	let staleExpandedReads = 0;
	let indicator = "Open mode picker, currently Flash";
	const triggerClick = vi.fn(async () => {
		pickerClicked = true;
		expanded = !options.delayedOpen;
	});
	const flashClick = vi.fn(async () => {
		expanded = false;
		pickerClicked = false;
		indicator = options.retainExtended
			? "Open mode picker, currently Flash Extended"
			: "Open mode picker, currently Flash";
	});
	const flashLiteClick = vi.fn(async () => {});
	const extendedClick = vi.fn(async () => {
		expanded = false;
		pickerClicked = false;
		indicator =
			indicator === "Open mode picker, currently Flash Extended"
				? "Open mode picker, currently Flash"
				: "Open mode picker, currently Flash Extended";
	});
	const labels = options.duplicateFlash
		? ["3.8 Flash All-around help", "3.8 Flash All-around help", "Extended thinking Complex problem solving"]
		: ["3.8 Flash All-around help", "3.8 Flash-Lite Fastest answers", "Extended thinking Complex problem solving"];
	const action = (click: ReturnType<typeof vi.fn>, disabled = false) => ({
		waitFor: vi.fn(async () => {}),
		getAttribute: vi.fn(async (name: string) => (name === "aria-disabled" && disabled ? "true" : null)),
		click,
	});
	const actions = [action(flashClick, options.flashDisabled), action(flashLiteClick), action(extendedClick)];
	const nth = vi.fn((index: number) => actions[index]);
	const menu = {
		waitFor: vi.fn(async () => {}),
		getAttribute: vi.fn(async (name: string) => (name === "role" ? "menu" : null)),
		locator: vi.fn((selector: string) => {
			if (selector !== GEMINI_MODE_MENU_ITEM_SELECTOR) throw new Error(`unexpected menu selector ${selector}`);
			return { allInnerTexts: async () => labels, nth, first: () => ({ waitFor: vi.fn(async () => {}) }) };
		}),
	};
	const trigger = {
		waitFor: vi.fn(async () => {}),
		click: triggerClick,
		evaluate: vi.fn(async () => ({})),
		getAttribute: vi.fn(async (name: string) => {
			if (name === "aria-expanded") {
				// A torn-down overlay can still report expanded=true once; the
				// runtime must not trust it as an open, fresh menu.
				if (options.staleExpandedOnce && !pickerClicked && staleExpandedReads === 0) {
					staleExpandedReads += 1;
					return "true";
				}
				if (pickerClicked && options.delayedOpen && ++delayedReads >= 2) expanded = true;
				return expanded ? "true" : "false";
			}
			if (name === "aria-controls") return "ng-menu-1";
			if (name === "aria-label") return indicator;
			return null;
		}),
	};
	const composer = { waitFor: vi.fn(async () => {}) };
	const page = {
		url: () => "https://gemini.google.com/app",
		locator(selector: string) {
			if (selector === GEMINI_COMPOSER_SELECTOR) return { filter: () => ({ first: () => composer }) };
			if (selector === GEMINI_MODE_PICKER_SELECTOR) return { filter: () => ({ last: () => trigger }) };
			if (selector === '[id="ng-menu-1"]') return menu;
			throw new Error(`unexpected page selector ${selector}`);
		},
	} as unknown as Page;
	return { page, triggerClick, flashClick, flashLiteClick, extendedClick, nth };
}

describe("geminiSelectDefaultMode", () => {
	it("selects exact 3.8 Flash plus Extended without using Flash-Lite", async () => {
		const { page, triggerClick, flashClick, flashLiteClick, extendedClick, nth } = modePickerPage();

		await geminiSelectDefaultMode(page);

		expect(triggerClick).toHaveBeenCalledTimes(2);
		expect(nth).toHaveBeenNthCalledWith(1, 0);
		expect(nth).toHaveBeenNthCalledWith(2, 2);
		expect(flashClick).toHaveBeenCalledOnce();
		expect(flashLiteClick).not.toHaveBeenCalled();
		expect(extendedClick).toHaveBeenCalledOnce();
	});

	it("accepts retained Extended after Flash selection on consecutive turns", async () => {
		const { page, flashClick, extendedClick } = modePickerPage({ retainExtended: true });
		await geminiSelectDefaultMode(page);
		await geminiSelectDefaultMode(page);
		expect(flashClick).toHaveBeenCalledTimes(2);
		expect(extendedClick).not.toHaveBeenCalled();
	});

	it("waits for the asynchronous picker expansion", async () => {
		const { page } = modePickerPage({ delayedOpen: true });
		await expect(geminiSelectDefaultMode(page)).resolves.toBeUndefined();
	});

	it("reopens a fresh menu when a torn-down overlay still reports expanded", async () => {
		const { page, triggerClick, flashClick, extendedClick } = modePickerPage({ staleExpandedOnce: true });
		await expect(geminiSelectDefaultMode(page)).resolves.toBeUndefined();
		expect(flashClick).toHaveBeenCalledOnce();
		expect(extendedClick).toHaveBeenCalledOnce();
		// Both opens clicked the trigger: the stale expanded=true must not be
		// trusted as an already-open fresh menu.
		expect(triggerClick).toHaveBeenCalledTimes(2);
	});

	it("fails explicitly rather than choosing another model when Flash is disabled", async () => {
		const { page, flashClick, extendedClick } = modePickerPage({ flashDisabled: true });
		await expect(geminiSelectDefaultMode(page)).rejects.toThrow("3.8 Flash is disabled");
		expect(flashClick).not.toHaveBeenCalled();
		expect(extendedClick).not.toHaveBeenCalled();
	});

	it("fails closed when the exact Flash model is ambiguous", async () => {
		const { page, flashClick, extendedClick } = modePickerPage({ duplicateFlash: true });
		await expect(geminiSelectDefaultMode(page)).rejects.toThrow("expected exactly one");
		expect(flashClick).not.toHaveBeenCalled();
		expect(extendedClick).not.toHaveBeenCalled();
	});
});

describe("geminiSend", () => {
	it("keyboard-activates the ready send button", async () => {
		const fill = vi.fn(async () => {});
		const press = vi.fn(async () => {});
		const sendButton = {
			waitFor: vi.fn(async () => {}),
			isEnabled: vi.fn(async () => true),
			getAttribute: vi.fn(async () => null),
			press,
		};
		const composer = { fill };
		const page = {
			locator(selector: string) {
				if (selector === 'rich-textarea [contenteditable="true"]') {
					return { filter: () => ({ first: () => composer }) };
				}
				return { filter: () => ({ last: () => sendButton }) };
			},
		} as unknown as Page;

		await geminiSend(page, "hello");

		expect(fill).toHaveBeenNthCalledWith(1, "");
		expect(fill).toHaveBeenNthCalledWith(2, "hello");
		expect(press).toHaveBeenCalledWith("Enter");
	});
});

describe("geminiLastResponseText", () => {
	it("returns the newest response text, or empty when none", async () => {
		expect(await geminiLastResponseText(fakePage([]).page)).toBe("");
		expect(await geminiLastResponseText(fakePage(["old answer"]).page)).toBe("old answer");
	});
});

describe("geminiSnapshot", () => {
	const executionError = "I encountered an error doing what you asked. Could you try again?";

	it.each([
		executionError,
		"  I encountered an error doing what you asked.\n Could you try again?  ",
		"Something went wrong. Please try again later.",
		"An error occurred. Please try again.",
	])("throws provider_error for a complete provider failure: %s", async (text) => {
		await expect(geminiSnapshot(fakePage(["old answer", text]).page, "old answer")).rejects.toMatchObject({
			name: "InternetError",
			kind: "provider_error",
		});
	});

	it.each([
		{ errorSurface: true },
		{ retry: "Try again" },
		{ retry: "Retry response" },
		{ text: "Partially generated answer", errorSurface: true },
	])("detects newest provider chrome even without markdown: %j", async (failure) => {
		await expect(geminiSnapshot(fakePage(["old answer", failure]).page, "old answer")).rejects.toMatchObject({
			kind: "provider_error",
		});
	});

	it.each([
		"I can't help with that request.",
		"I cannot provide instructions for that, but I can suggest safer alternatives.",
		`The provider said: ${executionError}`,
		`“${executionError}”`,
		`${executionError} This is an example of an execution failure.`,
		"An error occurred in your code. Try checking the input.",
		"Something went wrong in the story, but they fixed it.",
	])("preserves refusals and error discussion: %s", async (text) => {
		await expect(geminiSnapshot(fakePage([text]).page)).resolves.toMatchObject({ responsePresent: true, text });
	});

	it("preserves exact error templates inside quotes or code markup", async () => {
		await expect(geminiSnapshot(fakePage([{ text: executionError, quoted: true }]).page)).resolves.toMatchObject({
			responsePresent: true,
		});
	});

	it("does not classify an incomplete streaming sentence as a whole-message error", async () => {
		await expect(geminiSnapshot(fakePage([executionError], true).page)).resolves.toMatchObject({ running: true });
	});

	it.each(["Regenerate", "Redo", "Try again with a different example"])(
		"ignores ordinary action %s",
		async (retry) => {
			await expect(geminiSnapshot(fakePage([{ text: "answer", retry }]).page)).resolves.toMatchObject({
				responsePresent: true,
			});
		},
	);

	it("ignores error surfaces and retry controls on older responses", async () => {
		const { page } = fakePage([{ text: executionError, errorSurface: true, retry: "Retry" }, "new answer"]);
		await expect(geminiSnapshot(page, executionError)).resolves.toMatchObject({
			text: "new answer",
			responsePresent: true,
		});
	});

	it("ignores an unchanged previous error while waiting for a new turn", async () => {
		const { page } = fakePage([{ text: executionError, errorSurface: true, retry: "Retry" }]);
		await expect(geminiSnapshot(page, executionError)).resolves.toMatchObject({ responsePresent: false });
	});

	it("does not fall back to older markdown while a new empty response starts", async () => {
		await expect(geminiSnapshot(fakePage([executionError, {}]).page)).resolves.toMatchObject({
			responsePresent: false,
			text: "",
		});
	});

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
