import type { Page } from "patchright-core";
import { type AuthenticationAssessment, waitAuthenticationAssessment } from "#internet/browser/authentication";
import type { CompletionSnapshot } from "#internet/browser/completion";
import { waitForSendReady } from "#internet/browser/submission";

export const GEMINI_HOME_URL = "https://gemini.google.com/app";

export const GEMINI_COMPOSER_SELECTOR = 'rich-textarea [contenteditable="true"]';
export const GEMINI_SEND_BUTTON_SELECTOR = 'input-area-v2 button[aria-label="Send message"]';
export const GEMINI_STOP_BUTTON_SELECTOR = 'button[aria-label="Stop response"]';
export const GEMINI_ACCOUNT_SELECTOR = '[aria-label^="Google Account"], [aria-label*="Google Account:"]';
export const GEMINI_RESPONSE_SELECTOR =
	"model-response .model-response-text message-content .markdown.markdown-main-panel";
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
