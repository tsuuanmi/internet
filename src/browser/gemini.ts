import type { Locator, Page } from "patchright-core";
import { type AuthenticationAssessment, waitAuthenticationAssessment } from "#internet/browser/authentication";
import type { CompletionSnapshot } from "#internet/browser/completion";
import { waitForSendReady } from "#internet/browser/submission";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

export const GEMINI_HOME_URL = "https://gemini.google.com/app";

export const GEMINI_COMPOSER_SELECTOR = 'rich-textarea [contenteditable="true"]';
export const GEMINI_SEND_BUTTON_SELECTOR = 'input-area-v2 button[aria-label="Send message"]';
export const GEMINI_STOP_BUTTON_SELECTOR = 'button[aria-label="Stop response"]';
export const GEMINI_ACCOUNT_SELECTOR = '[aria-label^="Google Account"], [aria-label*="Google Account:"]';
export const GEMINI_RESPONSE_SELECTOR =
	"model-response .model-response-text message-content .markdown.markdown-main-panel";

/** Gemini's current provider-owned mode-picker trigger. */
export const GEMINI_MODE_PICKER_SELECTOR = 'button[data-test-id="bard-mode-menu-button"]';
export const GEMINI_MODE_MENU_ITEM_SELECTOR = '[role="menuitem"]';
export const GEMINI_DEFAULT_FLASH_LABEL = "3.8 Flash";
export const GEMINI_DEFAULT_EXTENDED_LABEL = "Extended thinking";
const GEMINI_DEFAULT_FLASH_INDICATOR = "Open mode picker, currently Flash";
const GEMINI_DEFAULT_FLASH_EXTENDED_INDICATOR = "Open mode picker, currently Flash Extended";
export const GEMINI_DEEP_RESEARCH_REPORT_SELECTOR =
	'response-container structured-content-container[data-test-id="message-content"] message-content #extended-response-markdown-content';
export const GEMINI_DEEP_RESEARCH_SOURCES_SELECTOR = "response-container deep-research-source-lists";

/** True when Gemini exposes both its composer and signed-in Google account control. */
export async function geminiIsAuthenticated(page: Page): Promise<boolean> {
	const composers = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true });
	const accounts = page.locator(GEMINI_ACCOUNT_SELECTOR).filter({ visible: true });
	return (await composers.count()) === 1 && (await accounts.count()) > 0;
}

const GEMINI_LOGIN_SURFACE_SELECTOR = ['[data-identifier="sign-in"]'].join(", ");
const GEMINI_CHALLENGE_SURFACE_SELECTOR = [
	"[data-challengeid]",
	':text("Verify it’s you")',
	':text("Verify it is you")',
	':text("unusual traffic")',
].join(", ");

async function hasVisibleSurface(page: Page, selector: string): Promise<boolean> {
	try {
		return (await page.locator(selector).filter({ visible: true }).count()) > 0;
	} catch {
		return false;
	}
}

function urlContainsChallenge(url: string): boolean {
	return /(?:challenge|captcha|verify)(?:[/?#]|$)/i.test(url);
}

function urlIsLogin(url: string): boolean {
	return /^https:\/\/accounts\.google\.com\/(?:signin|v3\/signin|ServiceLogin)/i.test(url);
}

/** Assess Gemini auth without treating a missing composer as proof of logout. */
export async function geminiAuthenticationAssessment(page: Page): Promise<AuthenticationAssessment> {
	const url = page.url();
	try {
		if (await geminiIsAuthenticated(page)) return { state: "authenticated", evidence: "authenticated-surface" };
	} catch {
		// Navigation may replace the document between locator checks.
	}
	if (urlContainsChallenge(url)) return { state: "challenge", evidence: "challenge-url" };
	if (await hasVisibleSurface(page, GEMINI_CHALLENGE_SURFACE_SELECTOR)) {
		return { state: "challenge", evidence: "challenge-surface" };
	}
	if (urlIsLogin(url)) return { state: "signed-out", evidence: "login-url" };
	if (await hasVisibleSurface(page, GEMINI_LOGIN_SURFACE_SELECTOR)) {
		return { state: "signed-out", evidence: "login-surface" };
	}
	return { state: "unconfirmed", evidence: "timeout" };
}

/** Wait for a conclusive Gemini auth surface or return the latest conclusive observation. */
export async function geminiWaitAuthenticationAssessment(
	page: Page,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<AuthenticationAssessment> {
	return waitAuthenticationAssessment(() => geminiAuthenticationAssessment(page), timeoutMs, signal);
}

/** Wait until Gemini is authenticated (composer visible), or return false. */
export async function geminiWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
	return (await geminiWaitAuthenticationAssessment(page, timeoutMs, signal)).state === "authenticated";
}

/**
 * Open Gemini's provider-owned mode picker and return its current menu. The
 * generated menu id is read from the trigger rather than treated as a selector.
 */
async function geminiOpenModePicker(page: Page): Promise<{ trigger: Locator; menu: Locator }> {
	const composer = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true }).first();
	const trigger = page.locator(GEMINI_MODE_PICKER_SELECTOR).filter({ visible: true }).last();
	try {
		await composer.waitFor({ state: "visible", timeout: 60_000 });
		await trigger.waitFor({ state: "visible", timeout: 60_000 });
		if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click({ timeout: 10_000 });
		if ((await trigger.getAttribute("aria-expanded")) !== "true") {
			throw new Error("mode picker did not report aria-expanded=true");
		}
		const menuId = await trigger.getAttribute("aria-controls");
		if (menuId === null || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(menuId)) {
			throw new Error("mode picker exposed no safe aria-controls menu id");
		}
		const menu = page.locator(`[id="${menuId}"]`);
		await menu.waitFor({ state: "visible", timeout: 10_000 });
		if ((await menu.getAttribute("role")) !== "menu") throw new Error("mode picker menu did not expose role=menu");
		return { trigger, menu };
	} catch (error) {
		throw new InternetError(
			"provider_error",
			`Gemini mode picker is unavailable or its contract changed${error instanceof Error ? ` (${error.message})` : ""}`,
		);
	}
}

async function geminiSelectModeAction(menu: Locator, label: string): Promise<void> {
	const action = menu.locator(GEMINI_MODE_MENU_ITEM_SELECTOR).filter({ hasText: label }).last();
	try {
		await action.waitFor({ state: "visible", timeout: 10_000 });
		if ((await action.getAttribute("aria-disabled")) === "true") throw new Error(`${label} is disabled`);
		await action.click({ timeout: 10_000 });
	} catch (error) {
		throw new InternetError(
			"provider_error",
			`Gemini mode ${label} is unavailable or its picker contract changed${error instanceof Error ? ` (${error.message})` : ""}`,
		);
	}
}

async function geminiWaitForModeIndicator(trigger: Locator, expected: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if ((await trigger.getAttribute("aria-label").catch(() => null)) === expected) return;
		await sleep(100);
	}
	const observed = await trigger.getAttribute("aria-label").catch(() => null);
	throw new InternetError(
		"provider_error",
		`Gemini did not confirm mode ${expected} (mode-picker aria-label: ${JSON.stringify(observed)})`,
	);
}

/**
 * Select the observed Gemini default before every ordinary turn: the latest
 * Flash model and Extended thinking. Gemini's UI renders a provider-owned
 * composer indicator after each action; do not assume a prior thread's mode.
 */
export async function geminiSelectDefaultMode(page: Page): Promise<void> {
	const flash = await geminiOpenModePicker(page);
	await geminiSelectModeAction(flash.menu, GEMINI_DEFAULT_FLASH_LABEL);
	await geminiWaitForModeIndicator(flash.trigger, GEMINI_DEFAULT_FLASH_INDICATOR);

	const extended = await geminiOpenModePicker(page);
	await geminiSelectModeAction(extended.menu, GEMINI_DEFAULT_EXTENDED_LABEL);
	await geminiWaitForModeIndicator(extended.trigger, GEMINI_DEFAULT_FLASH_EXTENDED_INDICATOR);
}

/** Fill the Gemini composer with the prompt and submit it. */
export async function geminiSend(page: Page, prompt: string): Promise<void> {
	const composer = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true }).first();
	await composer.fill("");
	await composer.fill(prompt);
	const sendButton = page.locator(GEMINI_SEND_BUTTON_SELECTOR).filter({ visible: true }).last();
	await waitForSendReady("Gemini", sendButton);
	// Keyboard-activate the semantic button. Gemini may replace it during input,
	// but Locator re-resolution avoids stale elements and pointer stability checks.
	await sendButton.press("Enter");
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

/** Read the previous completed Gemini Deep Research report, if any. */
export async function geminiLastDeepResearchReportText(page: Page): Promise<string> {
	const reports = page.locator(GEMINI_DEEP_RESEARCH_REPORT_SELECTOR).filter({ visible: true });
	const count = await reports.count();
	if (count === 0) return "";
	return (await reports.last().innerText()).trim();
}

/**
 * Gemini publishes a final report in an extended response surface rather than
 * its normal model-response stream. A non-busy report with the report's own
 * visible sources panel is the provider-owned completion contract.
 */
export async function geminiDeepResearchSnapshot(page: Page, previousReportText?: string): Promise<CompletionSnapshot> {
	const reports = page.locator(GEMINI_DEEP_RESEARCH_REPORT_SELECTOR).filter({ visible: true });
	const count = await reports.count();
	if (count === 0) return { responsePresent: false, text: "", html: "", running: true };
	const report = reports.last();
	const [text, html, busy, sources] = await Promise.all([
		report.innerText(),
		report.innerHTML(),
		report.getAttribute("aria-busy"),
		page.locator(GEMINI_DEEP_RESEARCH_SOURCES_SELECTOR).filter({ visible: true }).count(),
	]);
	const trimmed = text.trim();
	const present =
		trimmed.length > 0 &&
		(previousReportText === undefined || previousReportText === "" || trimmed !== previousReportText);
	const complete = busy === "false" && sources > 0;
	return { responsePresent: present && complete, text: trimmed, html, running: !complete };
}
