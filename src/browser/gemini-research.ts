import type { Page } from "patchright-core";
import { GEMINI_COMPOSER_SELECTOR } from "#internet/browser/gemini";
import { InternetError } from "#internet/core/errors";

const GEMINI_TOOLS_TRIGGER = 'button[aria-label="Upload & tools"]';
const GEMINI_DEEP_RESEARCH_OPTION = 'button[role="menuitemcheckbox"]';
const GEMINI_DEEP_RESEARCH_ACTIVE = 'button[aria-label="Deselect Deep research"]';

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
