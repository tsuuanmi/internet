import type { Page } from "playwright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

export const GEMINI_HOME_URL = "https://gemini.google.com/app";

export const GEMINI_COMPOSER_SELECTOR = 'rich-textarea [contenteditable="true"]';
export const GEMINI_SEND_BUTTON_SELECTOR = 'input-area-v2 button[aria-label="Send message"]';
export const GEMINI_STOP_BUTTON_SELECTOR = 'button[aria-label="Stop response"]';
export const GEMINI_RESPONSE_SELECTOR =
	"model-response .model-response-text message-content .markdown.markdown-main-panel";

/** True when the Gemini home page exposes its composer. */
export async function geminiIsAuthenticated(page: Page): Promise<boolean> {
	const composers = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true });
	return (await composers.count()) === 1;
}

/** Wait until Gemini is authenticated (composer visible), or return false. */
export async function geminiWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
		}
		if (await geminiIsAuthenticated(page)) return true;
		await sleep(200, signal);
	}
	return false;
}

/** Fill the Gemini composer with the prompt and submit it. */
export async function geminiSend(page: Page, prompt: string): Promise<void> {
	const composer = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true }).first();
	await composer.fill("");
	await composer.fill(prompt);
	const sendButton = page.locator(GEMINI_SEND_BUTTON_SELECTOR).filter({ visible: true }).last();
	await sendButton.waitFor({ state: "visible", timeout: 20_000 });
	if (!(await sendButton.isEnabled())) {
		throw new InternetError("provider_error", "Gemini send button is disabled after attaching the prompt");
	}
	await sendButton.click();
}

/** Read the visible text of the current newest Gemini response (empty when none). */
export async function geminiLastResponseText(page: Page): Promise<string> {
	const responses = page.locator(GEMINI_RESPONSE_SELECTOR).filter({ visible: true });
	const count = await responses.count();
	if (count === 0) return "";
	return (await responses.last().innerText()).trim();
}

/**
 * Snapshot the newest Gemini response. Pass `previousTurnText` (the last
 * response's text captured before sending) so a response is only treated as
 * present once the newest response differs from it — robust to resuming a
 * durable conversation where the previous turn is already visible on the page.
 */
export async function geminiSnapshot(page: Page, previousTurnText?: string): Promise<CompletionSnapshot> {
	const responses = page.locator(GEMINI_RESPONSE_SELECTOR).filter({ visible: true });
	const count = await responses.count();
	if (count === 0) return { responsePresent: false, text: "", html: "", running: false };
	const response = responses.last();
	const [text, html, running] = await Promise.all([
		response.innerText(),
		response.innerHTML(),
		page
			.locator(GEMINI_STOP_BUTTON_SELECTOR)
			.filter({ visible: true })
			.count()
			.then((count) => count > 0),
	]);
	const trimmed = text.trim();
	const present =
		previousTurnText === undefined || previousTurnText === "" ? trimmed.length > 0 : trimmed !== previousTurnText;
	return { responsePresent: present, text: trimmed, html, running };
}
