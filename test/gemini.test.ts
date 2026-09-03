import type { Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import {
	GEMINI_ACCOUNT_SELECTOR,
	GEMINI_COMPOSER_SELECTOR,
	GEMINI_DEFAULT_EXTENDED_LABEL,
	GEMINI_DEFAULT_FLASH_LABEL,
	GEMINI_MODE_MENU_ITEM_SELECTOR,
	GEMINI_MODE_PICKER_SELECTOR,
	GEMINI_STOP_BUTTON_SELECTOR,
	geminiAuthenticationAssessment,
	geminiLastResponseText,
	geminiSelectDefaultMode,
	geminiSend,
	geminiSnapshot,
	geminiWaitAuthenticationAssessment,
} from "#internet/browser/gemini";

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

function modePickerPage(flashDisabled = false): {
	page: Page;
	triggerClick: ReturnType<typeof vi.fn>;
	flashClick: ReturnType<typeof vi.fn>;
	extendedClick: ReturnType<typeof vi.fn>;
	menuItemFilter: ReturnType<typeof vi.fn>;
} {
	let expanded = false;
	let indicator = "Open mode picker, currently Flash";
	const triggerClick = vi.fn(async () => {
		expanded = true;
	});
	const flashClick = vi.fn(async () => {
		expanded = false;
		indicator = "Open mode picker, currently Flash";
	});
	const extendedClick = vi.fn(async () => {
		expanded = false;
		indicator = "Open mode picker, currently Flash Extended";
	});
	const action = (click: ReturnType<typeof vi.fn>, disabled = false) => ({
		waitFor: vi.fn(async () => {}),
		getAttribute: vi.fn(async (name: string) => (name === "aria-disabled" && disabled ? "true" : null)),
		click,
	});
	const menuItemFilter = vi.fn((options: { hasText?: string }) => ({
		last: () =>
			options.hasText === GEMINI_DEFAULT_FLASH_LABEL ? action(flashClick, flashDisabled) : action(extendedClick),
	}));
	const menu = {
		waitFor: vi.fn(async () => {}),
		getAttribute: vi.fn(async (name: string) => (name === "role" ? "menu" : null)),
		locator: vi.fn((selector: string) => {
			if (selector !== GEMINI_MODE_MENU_ITEM_SELECTOR) throw new Error(`unexpected menu selector ${selector}`);
			return { filter: menuItemFilter };
		}),
	};
	const trigger = {
		waitFor: vi.fn(async () => {}),
		click: triggerClick,
		getAttribute: vi.fn(async (name: string) => {
			if (name === "aria-expanded") return expanded ? "true" : "false";
			if (name === "aria-controls") return "ng-menu-1";
			if (name === "aria-label") return indicator;
			return null;
		}),
	};
	const composer = { waitFor: vi.fn(async () => {}) };
	const page = {
		locator(selector: string) {
			if (selector === GEMINI_COMPOSER_SELECTOR) return { filter: () => ({ first: () => composer }) };
			if (selector === GEMINI_MODE_PICKER_SELECTOR) return { filter: () => ({ last: () => trigger }) };
			if (selector === '[id="ng-menu-1"]') return menu;
			throw new Error(`unexpected page selector ${selector}`);
		},
	} as unknown as Page;
	return { page, triggerClick, flashClick, extendedClick, menuItemFilter };
}

describe("geminiSelectDefaultMode", () => {
	it("selects and confirms the current Flash plus Extended default before a turn", async () => {
		const { page, triggerClick, flashClick, extendedClick, menuItemFilter } = modePickerPage();

		await geminiSelectDefaultMode(page);

		expect(triggerClick).toHaveBeenCalledTimes(2);
		expect(menuItemFilter).toHaveBeenNthCalledWith(1, { hasText: GEMINI_DEFAULT_FLASH_LABEL });
		expect(menuItemFilter).toHaveBeenNthCalledWith(2, { hasText: GEMINI_DEFAULT_EXTENDED_LABEL });
		expect(flashClick).toHaveBeenCalledOnce();
		expect(extendedClick).toHaveBeenCalledOnce();
	});

	it("fails explicitly rather than choosing another model when Flash is disabled", async () => {
		const { page, flashClick, extendedClick } = modePickerPage(true);

		await expect(geminiSelectDefaultMode(page)).rejects.toThrow("3.8 Flash is disabled");
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
