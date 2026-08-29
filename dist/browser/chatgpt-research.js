import { CHATGPT_COMPOSER_SELECTOR, CHATGPT_SEND_BUTTON_SELECTOR, CHATGPT_SUBSCRIPTION_FAILURE_CLOSE_SELECTOR, CHATGPT_SUBSCRIPTION_FAILURE_SELECTOR, } from "#internet/browser/chatgpt";
import { waitForSendReady } from "#internet/browser/submission";
import { InternetError } from "#internet/core/errors";
const CHATGPT_DEEP_RESEARCH_TRIGGER = 'button[data-testid="composer-plus-btn"]';
const CHATGPT_DEEP_RESEARCH_OPTION = '[data-composer-plugin-impression-id="connector_openai_deep_research"] > [tabindex="0"]';
const CHATGPT_DEEP_RESEARCH_PILL = '[data-inline-selection-pill][data-id="plugin:connector_openai_deep_research"][data-system-hint-type="plugin:connector_openai_deep_research"]';
const CHATGPT_DEEP_RESEARCH_EXPORT = 'button[aria-label="Export"]';
/** Enable ChatGPT Deep Research and verify its provider-owned composer pill. */
export async function chatgptEnableDeepResearch(page) {
    const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
    await composer.waitFor({ state: "visible", timeout: 60_000 });
    const modal = page.locator(CHATGPT_SUBSCRIPTION_FAILURE_SELECTOR).filter({ visible: true }).last();
    if (await modal.isVisible().catch(() => false)) {
        await modal.locator(CHATGPT_SUBSCRIPTION_FAILURE_CLOSE_SELECTOR).last().click();
        await modal.waitFor({ state: "hidden", timeout: 10_000 });
    }
    const trigger = composer.locator("xpath=ancestor::form[1]").locator(CHATGPT_DEEP_RESEARCH_TRIGGER).last();
    try {
        await trigger.click({ timeout: 10_000 });
        if ((await trigger.getAttribute("aria-expanded")) !== "true") {
            throw new Error("trigger did not expose aria-expanded=true");
        }
        const option = page.locator(CHATGPT_DEEP_RESEARCH_OPTION).filter({ visible: true }).last();
        await option.click({ timeout: 10_000 });
        await composer.locator(CHATGPT_DEEP_RESEARCH_PILL).waitFor({ state: "visible", timeout: 10_000 });
    }
    catch (error) {
        throw new InternetError("provider_error", `ChatGPT Deep Research is unavailable or its composer contract changed${error instanceof Error ? ` (${error.message})` : ""}`);
    }
}
/** Append a research question without replacing the verified Deep Research pill. */
export async function chatgptSendDeepResearch(page, prompt) {
    const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
    await composer.focus();
    await page.keyboard.insertText(prompt);
    const text = (await composer.innerText()).replace(/\u00a0/g, " ").trim();
    if (!text.endsWith(prompt)) {
        throw new InternetError("provider_error", "ChatGPT Deep Research prompt was not retained by the composer");
    }
    const send = composer.locator("xpath=ancestor::form[1]").locator(CHATGPT_SEND_BUTTON_SELECTOR).last();
    await waitForSendReady("ChatGPT", send);
    await send.press("Enter");
}
/**
 * Read the nested report frame. ChatGPT renders Deep Research outside the
 * normal assistant-turn surface, and its Export control exists only once a
 * report is published; it is the provider-owned completion affordance.
 */
export async function chatgptDeepResearchSnapshot(page, previousReportText) {
    let text = "";
    let html = "";
    let complete = false;
    // ChatGPT creates more than one blank child frame. Locate the one that owns
    // the report's semantic Export action rather than assuming frame position.
    for (const frame of page.frames()) {
        if (frame.url() !== "about:blank")
            continue;
        const exportCount = await frame
            .locator(CHATGPT_DEEP_RESEARCH_EXPORT)
            .count()
            .catch(() => 0);
        if (exportCount === 0)
            continue;
        const body = frame.locator("body");
        text = await body.innerText().catch(() => "");
        // The frame HTML includes provider bootstrap data and can be megabytes.
        // Return rendered report text rather than converting opaque internals.
        html = "";
        complete = true;
        break;
    }
    const trimmed = text.trim();
    const present = trimmed.length > 0 &&
        (previousReportText === undefined || previousReportText === "" || trimmed !== previousReportText);
    return { responsePresent: complete && present, text: trimmed, html, running: !complete };
}
//# sourceMappingURL=chatgpt-research.js.map