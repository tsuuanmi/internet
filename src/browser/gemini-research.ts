import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "patchright-core";
import { GEMINI_COMPOSER_SELECTOR } from "#internet/browser/gemini";
import { InternetError } from "#internet/core/errors";

const GEMINI_TOOLS_TRIGGER = 'button[aria-label="Upload & tools"]';
const GEMINI_DEEP_RESEARCH_OPTION = 'button[role="menuitemcheckbox"]';
const GEMINI_DEEP_RESEARCH_ACTIVE = 'button[aria-label="Deselect Deep research"]';
const GEMINI_START_RESEARCH = 'button[aria-label="Start research"]';
const GEMINI_RESEARCH_PLAN_TIMEOUT_MS = 180_000;

/** Enable Gemini Deep research and verify its active composer-mode button. */
export async function geminiEnableDeepResearch(page: Page): Promise<void> {
	const composer = page.locator(GEMINI_COMPOSER_SELECTOR).filter({ visible: true }).first();
	await composer.waitFor({ state: "visible", timeout: 60_000 });
	const trigger = page.locator(GEMINI_TOOLS_TRIGGER).filter({ visible: true }).last();
	try {
		await trigger.click({ timeout: 10_000 });
		const option = page
			.locator(GEMINI_DEEP_RESEARCH_OPTION)
			.filter({ hasText: "Deep research" })
			.filter({ visible: true })
			.last();
		if ((await option.getAttribute("aria-disabled")) === "true") throw new Error("Deep research is disabled");
		await option.click({ timeout: 10_000 });
		await page
			.locator(GEMINI_DEEP_RESEARCH_ACTIVE)
			.filter({ visible: true })
			.last()
			.waitFor({ state: "visible", timeout: 10_000 });
	} catch (error) {
		throw new InternetError(
			"provider_error",
			`Gemini Deep research is unavailable or its tools-menu contract changed${error instanceof Error ? ` (${error.message})` : ""}`,
		);
	}
}

/**
 * Gemini first generates a plan in Deep research mode. Confirm it using the
 * semantic Start research action before waiting for the final report.
 */
export async function geminiStartResearchPlan(
	page: Page,
	options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<void> {
	const start = page.locator(GEMINI_START_RESEARCH).filter({ visible: true }).last();
	const deadline = Date.now() + (options.timeoutMs ?? GEMINI_RESEARCH_PLAN_TIMEOUT_MS + 10_000);
	const check = () => {
		if (options.signal?.aborted) {
			throw options.signal.reason instanceof Error
				? options.signal.reason
				: new InternetError("aborted", "browser turn aborted");
		}
		if (Date.now() >= deadline) throw new InternetError("timeout", "Gemini research plan exceeded the turn deadline");
	};
	const pause = () => delay(Math.max(0, Math.min(100, deadline - Date.now())), undefined, { signal: options.signal });
	try {
		const planDeadline = Math.min(deadline, Date.now() + GEMINI_RESEARCH_PLAN_TIMEOUT_MS);
		while (true) {
			check();
			if (await start.isVisible()) break;
			if (Date.now() >= planDeadline) throw new Error("Start research did not become visible");
			await pause();
		}
		check();
		await start.press("Enter", { timeout: Math.max(1, Math.min(10_000, deadline - Date.now())) });
		const activationDeadline = Math.min(deadline, Date.now() + 10_000);
		while (Date.now() < activationDeadline) {
			check();
			if (!(await start.isVisible().catch(() => false))) return;
			if (await start.isDisabled().catch(() => false)) return;
			await pause();
		}
		check();
		throw new Error("Start research stayed enabled after activation");
	} catch (error) {
		check();
		throw new InternetError(
			"provider_error",
			`Gemini Deep research did not expose a usable Start research confirmation within ${GEMINI_RESEARCH_PLAN_TIMEOUT_MS}ms${error instanceof Error ? ` (${error.message})` : ""}`,
		);
	}
}
