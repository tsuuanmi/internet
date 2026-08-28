import type { Locator, Page } from "patchright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
import { waitForSendReady } from "#internet/browser/submission";
import type { ChatGptThinkingLevel } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

export const CHATGPT_HOME_URL = "https://chatgpt.com/";

export const CHATGPT_COMPOSER_SELECTOR = [
	'[data-testid="prompt-textarea"]',
	"#prompt-textarea",
	'[contenteditable="true"][data-lexical-editor="true"]',
].join(", ");

export const CHATGPT_SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"]';
export const CHATGPT_STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';
export const CHATGPT_ACCOUNT_SELECTOR = '[data-testid="accounts-profile-button"]';

/** The reasoning-level composer pill in the current ChatGPT UI. */
export const CHATGPT_EFFORT_CONTROL_SELECTOR =
	'button.__composer-pill.__composer-pill--neutral[aria-haspopup="menu"][data-tone="neutral"]:has(.text-token-text-tertiary)';

/** The open model/effort menu (menuitemradio list or reasoning-effort slider). */
export const CHATGPT_EFFORT_MENU_SELECTOR = [
	'[data-testid="composer-intelligence-picker-content"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
	'[role="menu"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
	'[role="group"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
].join(", ");

/** One reasoning-effort choice in the menu (Instant, Medium, High, …). */
export const CHATGPT_EFFORT_ITEM_SELECTOR = '[role="menuitemradio"]';

/** The reasoning-effort slider control, when the account renders a slider. */
export const CHATGPT_EFFORT_SLIDER_SELECTOR = '[data-model-reasoning-effort-slider] [role="slider"]';

/** ChatGPT exposes exactly three supported reasoning-effort options. */
export const CHATGPT_EFFORT_SLIDER_MAX_OPTIONS = 3;

/** UI index of each supported thinking level in the ChatGPT model switcher. */
export const CHATGPT_THINKING_LEVEL_INDEX: Record<ChatGptThinkingLevel, number> = {
	instant: 0,
	medium: 1,
	high: 2,
};

const CHATGPT_THINKING_LEVEL_LABEL: Record<ChatGptThinkingLevel, string> = {
	instant: "Instant",
	medium: "Medium",
	high: "High",
};

export const CHATGPT_ASSISTANT_TURN_SELECTOR = [
	'[data-testid^="conversation-turn-"][data-turn="assistant"]',
	'[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
	'[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
].join(", ");

/** True when ChatGPT exposes both its composer and signed-in account control. */
export async function chatgptIsAuthenticated(page: Page): Promise<boolean> {
	const composers = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true });
	const accounts = page.locator(CHATGPT_ACCOUNT_SELECTOR).filter({ visible: true });
	return (await composers.count()) === 1 && (await accounts.count()) > 0;
}

/** Wait until ChatGPT is authenticated (composer visible), or return false. */
export async function chatgptWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
		}
		if (await chatgptIsAuthenticated(page)) return true;
		await sleep(200, signal);
	}
	return false;
}

/** Fill the ChatGPT composer with the prompt and submit it. */
export async function chatgptSend(page: Page, prompt: string): Promise<void> {
	const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
	await composer.fill("");
	await composer.focus();
	await page.keyboard.insertText(prompt);
	const sendButton = composer.locator("xpath=ancestor::form[1]").locator(CHATGPT_SEND_BUTTON_SELECTOR);
	await waitForSendReady("ChatGPT", sendButton);
	// Keyboard-activate the semantic button. This avoids pointer stability and
	// overlay interception while preserving ChatGPT's submit behavior on follow-ups.
	await sendButton.press("Enter");
}

/** Read the visible text of the current newest ChatGPT assistant turn (empty when none). */
export async function chatgptLastAssistantTurnText(page: Page): Promise<string> {
	const turns = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).filter({ visible: true });
	const count = await turns.count();
	if (count === 0) return "";
	return (await turns.last().innerText()).trim();
}

/**
 * Snapshot the newest assistant turn. Pass `previousTurnText` (the last turn's
 * text captured before sending) so a response is only treated as present once
 * the newest turn differs from it — robust to ChatGPT virtualizing/recycling
 * turns so the visible count does not increase on continuation.
 */
export async function chatgptSnapshot(page: Page, previousTurnText?: string): Promise<CompletionSnapshot> {
	const turns = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).filter({ visible: true });
	const count = await turns.count();
	if (count === 0) return { responsePresent: false, text: "", html: "", running: false };
	const turn = turns.last();
	const [text, html, running] = await Promise.all([
		turn.innerText(),
		turn.innerHTML(),
		page
			.locator(CHATGPT_STOP_BUTTON_SELECTOR)
			.filter({ visible: true })
			.count()
			.then((count) => count > 0),
	]);
	const trimmed = text.trim();
	const present =
		previousTurnText === undefined || previousTurnText === "" ? trimmed.length > 0 : trimmed !== previousTurnText;
	return { responsePresent: present, text: trimmed, html, running };
}

export interface ChatGptEffortSliderState {
	min: number;
	max: number;
	value: number;
}

function safeIntegerAttribute(value: string | null): number | undefined {
	if (value === null || !/^-?\d+$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Parse a reasoning-effort slider's ARIA range, or undefined when invalid. */
export function parseChatGptEffortSliderState(
	rawMin: string | null,
	rawMax: string | null,
	rawValue: string | null,
): ChatGptEffortSliderState | undefined {
	const min = safeIntegerAttribute(rawMin);
	const max = safeIntegerAttribute(rawMax);
	const value = safeIntegerAttribute(rawValue);
	if (min === undefined || max === undefined || value === undefined) return undefined;
	const optionCount = max - min + 1;
	if (optionCount < 1 || optionCount > CHATGPT_EFFORT_SLIDER_MAX_OPTIONS) return undefined;
	if (value < min || value > max) return undefined;
	return { min, max, value };
}

async function verifyChatGptThinkingLevel(control: Locator, level: ChatGptThinkingLevel): Promise<void> {
	const expected = CHATGPT_THINKING_LEVEL_LABEL[level];
	const deadline = Date.now() + 40_000;
	while (Date.now() < deadline) {
		if ((await control.innerText().catch(() => "")).trim() === expected) return;
		await sleep(100);
	}
	throw new InternetError("provider_error", `ChatGPT did not confirm reasoning level ${expected}`);
}

/**
 * Select the ChatGPT reasoning-effort level before a turn. Opens the model
 * switcher and activates the target level, handling both the menuitemradio
 * list and the reasoning-effort slider surfaces. No-ops when the level is
 * already selected.
 */
export async function chatgptSelectThinkingLevel(page: Page, level: ChatGptThinkingLevel): Promise<void> {
	// Always open and semantically verify the picker: ChatGPT remembers the
	// previous UI choice, so even Instant must never be assumed selected.
	const targetIndex = CHATGPT_THINKING_LEVEL_INDEX[level];
	const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
	const composerForm = composer.locator("xpath=ancestor::form[1]");
	const effortControl = composerForm.locator(CHATGPT_EFFORT_CONTROL_SELECTOR).last();
	try {
		await effortControl.waitFor({ state: "visible", timeout: 70_000 });
	} catch {
		throw new InternetError(
			"provider_error",
			"ChatGPT rendered the composer but its model/effort control did not become ready",
		);
	}

	const effortMenu = page.locator(CHATGPT_EFFORT_MENU_SELECTOR).last();
	const menuVisible = await effortMenu.isVisible().catch(() => false);
	const menuExpanded = await effortControl.getAttribute("aria-expanded").catch(() => null);
	if (!menuVisible && menuExpanded !== "true") {
		await effortControl.press("Enter");
	}

	const effortChoices = effortMenu.locator(CHATGPT_EFFORT_ITEM_SELECTOR);
	const effortChoice = effortChoices.nth(targetIndex);
	const effortSlider = page.locator(CHATGPT_EFFORT_SLIDER_SELECTOR).filter({ visible: true }).last();
	const waitAbort = new AbortController();
	let ready: "items" | "slider";
	try {
		ready = await Promise.race([
			effortChoice
				.waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal })
				.then(() => "items" as const),
			effortSlider
				.waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal })
				.then(() => "slider" as const),
		]);
	} catch (error) {
		throw new InternetError(
			"provider_error",
			`ChatGPT effort menu did not expose item index ${targetIndex}` +
				`; item count: ${await effortChoices.count().catch(() => 0)}` +
				(error instanceof Error ? ` (${error.message})` : ""),
		);
	} finally {
		waitAbort.abort();
	}

	if (ready === "slider") {
		let sliderState = parseChatGptEffortSliderState(
			await effortSlider.getAttribute("aria-valuemin"),
			await effortSlider.getAttribute("aria-valuemax"),
			await effortSlider.getAttribute("aria-valuenow"),
		);
		if (!sliderState) {
			throw new InternetError("provider_error", "ChatGPT effort slider exposed an invalid ARIA range");
		}
		const targetValue = sliderState.min + targetIndex;
		if (targetValue > sliderState.max) {
			throw new InternetError(
				"provider_error",
				`ChatGPT effort slider does not expose item index ${targetIndex} (min=${sliderState.min}; max=${sliderState.max})`,
			);
		}
		const sliderControl = effortSlider.locator("xpath=ancestor::*[@role='menuitem'][1]");
		while (sliderState.value !== targetValue) {
			const direction = targetValue > sliderState.value ? 1 : -1;
			const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
			const previousValue = sliderState.value;
			await sliderControl.press(key);
			const changeDeadline = Date.now() + 5_000;
			do {
				sliderState = parseChatGptEffortSliderState(
					await effortSlider.getAttribute("aria-valuemin"),
					await effortSlider.getAttribute("aria-valuemax"),
					await effortSlider.getAttribute("aria-valuenow"),
				);
				if (!sliderState)
					throw new InternetError("provider_error", "ChatGPT effort slider lost its semantic ARIA state");
				if (sliderState.value !== previousValue) break;
				await sleep(50);
			} while (Date.now() < changeDeadline);
			if (sliderState.value !== previousValue + direction) {
				throw new InternetError(
					"provider_error",
					`ChatGPT effort slider did not move exactly one step with ${key}` +
						` (before=${previousValue}; after=${sliderState.value})`,
				);
			}
		}
		await page.keyboard.press("Escape");
		await verifyChatGptThinkingLevel(effortControl, level);
		return;
	}

	if ((await effortControl.innerText().catch(() => "")).trim() !== CHATGPT_THINKING_LEVEL_LABEL[level]) {
		await effortChoice.press("Enter");
		await verifyChatGptThinkingLevel(effortControl, level);
	}
	await page.keyboard.press("Escape");
}
