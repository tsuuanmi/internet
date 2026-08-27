import { waitForSendReady } from "#internet/browser/submission";
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
/** The model/effort switcher button in the ChatGPT composer. */
export const CHATGPT_EFFORT_CONTROL_SELECTOR = [
    'button[aria-haspopup="menu"][data-tone="neutral"]:has([data-animated-slider-trigger="true"])',
    'button[data-testid="model-switcher-dropdown-button"][aria-haspopup="menu"]',
].join(", ");
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
/** Upper bound on reasoning-effort options a slider may expose. */
export const CHATGPT_EFFORT_SLIDER_MAX_OPTIONS = 5;
/** UI index of each thinking level in the ChatGPT model switcher. */
export const CHATGPT_THINKING_LEVEL_INDEX = {
    instant: 0,
    medium: 1,
    high: 2,
    "extra-high": 3,
    pro: 4,
};
export const CHATGPT_ASSISTANT_TURN_SELECTOR = [
    '[data-testid^="conversation-turn-"][data-turn="assistant"]',
    '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
].join(", ");
/** True when ChatGPT exposes both its composer and signed-in account control. */
export async function chatgptIsAuthenticated(page) {
    const composers = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true });
    const accounts = page.locator(CHATGPT_ACCOUNT_SELECTOR).filter({ visible: true });
    return (await composers.count()) === 1 && (await accounts.count()) > 0;
}
/** Wait until ChatGPT is authenticated (composer visible), or return false. */
export async function chatgptWaitAuthenticated(page, timeoutMs, signal) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
        }
        if (await chatgptIsAuthenticated(page))
            return true;
        await sleep(200, signal);
    }
    return false;
}
/** Fill the ChatGPT composer with the prompt and submit it. */
export async function chatgptSend(page, prompt) {
    const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
    await composer.fill("");
    await composer.fill(prompt);
    const sendButton = composer.locator("xpath=ancestor::form[1]").locator(CHATGPT_SEND_BUTTON_SELECTOR);
    await waitForSendReady("ChatGPT", sendButton);
    // Keyboard-activate the semantic button. This avoids pointer stability and
    // overlay interception while preserving ChatGPT's submit behavior on follow-ups.
    await sendButton.press("Enter");
}
/** Read the visible text of the current newest ChatGPT assistant turn (empty when none). */
export async function chatgptLastAssistantTurnText(page) {
    const turns = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).filter({ visible: true });
    const count = await turns.count();
    if (count === 0)
        return "";
    return (await turns.last().innerText()).trim();
}
/**
 * Snapshot the newest assistant turn. Pass `previousTurnText` (the last turn's
 * text captured before sending) so a response is only treated as present once
 * the newest turn differs from it — robust to ChatGPT virtualizing/recycling
 * turns so the visible count does not increase on continuation.
 */
export async function chatgptSnapshot(page, previousTurnText) {
    const turns = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).filter({ visible: true });
    const count = await turns.count();
    if (count === 0)
        return { responsePresent: false, text: "", html: "", running: false };
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
    const present = previousTurnText === undefined || previousTurnText === "" ? trimmed.length > 0 : trimmed !== previousTurnText;
    return { responsePresent: present, text: trimmed, html, running };
}
function safeIntegerAttribute(value) {
    if (value === null || !/^-?\d+$/.test(value))
        return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
/** Parse a reasoning-effort slider's ARIA range, or undefined when invalid. */
export function parseChatGptEffortSliderState(rawMin, rawMax, rawValue) {
    const min = safeIntegerAttribute(rawMin);
    const max = safeIntegerAttribute(rawMax);
    const value = safeIntegerAttribute(rawValue);
    if (min === undefined || max === undefined || value === undefined)
        return undefined;
    const optionCount = max - min + 1;
    if (optionCount < 1 || optionCount > CHATGPT_EFFORT_SLIDER_MAX_OPTIONS)
        return undefined;
    if (value < min || value > max)
        return undefined;
    return { min, max, value };
}
/**
 * Select the ChatGPT reasoning-effort level before a turn. Opens the model
 * switcher and activates the target level, handling both the menuitemradio
 * list and the reasoning-effort slider surfaces. No-ops when the level is
 * already selected.
 */
export async function chatgptSelectThinkingLevel(page, level) {
    // Instant is the universal UI default, so it requires no picker interaction.
    if (level === "instant")
        return;
    const targetIndex = CHATGPT_THINKING_LEVEL_INDEX[level];
    const composer = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).first();
    const composerForm = composer.locator("xpath=ancestor::form[1]");
    const effortControl = composerForm.locator(CHATGPT_EFFORT_CONTROL_SELECTOR).last();
    try {
        await effortControl.waitFor({ state: "visible", timeout: 70_000 });
    }
    catch {
        throw new InternetError("provider_error", "ChatGPT rendered the composer but its model/effort control did not become ready");
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
    let ready;
    try {
        ready = await Promise.race([
            effortChoice
                .waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal })
                .then(() => "items"),
            effortSlider
                .waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal })
                .then(() => "slider"),
        ]);
    }
    catch (error) {
        throw new InternetError("provider_error", `ChatGPT effort menu did not expose item index ${targetIndex}` +
            `; item count: ${await effortChoices.count().catch(() => 0)}` +
            (error instanceof Error ? ` (${error.message})` : ""));
    }
    finally {
        waitAbort.abort();
    }
    if (ready === "slider") {
        let sliderState = parseChatGptEffortSliderState(await effortSlider.getAttribute("aria-valuemin"), await effortSlider.getAttribute("aria-valuemax"), await effortSlider.getAttribute("aria-valuenow"));
        if (!sliderState) {
            throw new InternetError("provider_error", "ChatGPT effort slider exposed an invalid ARIA range");
        }
        const targetValue = sliderState.min + targetIndex;
        if (targetValue > sliderState.max) {
            throw new InternetError("provider_error", `ChatGPT effort slider does not expose item index ${targetIndex} (min=${sliderState.min}; max=${sliderState.max})`);
        }
        const sliderControl = effortSlider.locator("xpath=ancestor::*[@role='menuitem'][1]");
        while (sliderState.value !== targetValue) {
            const direction = targetValue > sliderState.value ? 1 : -1;
            const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
            const previousValue = sliderState.value;
            await sliderControl.press(key);
            const changeDeadline = Date.now() + 5_000;
            do {
                sliderState = parseChatGptEffortSliderState(await effortSlider.getAttribute("aria-valuemin"), await effortSlider.getAttribute("aria-valuemax"), await effortSlider.getAttribute("aria-valuenow"));
                if (!sliderState)
                    throw new InternetError("provider_error", "ChatGPT effort slider lost its semantic ARIA state");
                if (sliderState.value !== previousValue)
                    break;
                await sleep(50);
            } while (Date.now() < changeDeadline);
            if (sliderState.value !== previousValue + direction) {
                throw new InternetError("provider_error", `ChatGPT effort slider did not move exactly one step with ${key}` +
                    ` (before=${previousValue}; after=${sliderState.value})`);
            }
        }
        await page.keyboard.press("Escape");
        return;
    }
    const selected = await effortChoice.getAttribute("aria-checked");
    if (selected !== "true" && selected !== "false") {
        throw new InternetError("provider_error", `ChatGPT effort item index ${targetIndex} has no semantic checked state`);
    }
    if (selected === "true") {
        await page.keyboard.press("Escape");
        return;
    }
    await effortChoice.press("Enter");
    const deadline = Date.now() + 40_000;
    let confirmed = null;
    while (Date.now() < deadline) {
        if (!(await effortMenu.isVisible().catch(() => false))) {
            const expanded = await effortControl.getAttribute("aria-expanded").catch(() => null);
            if (expanded !== "true") {
                await effortControl.press("Enter");
            }
            await effortChoice.waitFor({
                state: "visible",
                timeout: Math.max(1, Math.min(5_000, deadline - Date.now())),
            });
        }
        confirmed = await effortChoice.getAttribute("aria-checked");
        if (confirmed === "true") {
            await page.keyboard.press("Escape");
            return;
        }
        if (confirmed !== "false") {
            throw new InternetError("provider_error", `ChatGPT effort item index ${targetIndex} lost its semantic checked state`);
        }
        await sleep(100);
    }
    throw new InternetError("provider_error", `ChatGPT did not confirm effort item index ${targetIndex} (aria-checked=${JSON.stringify(confirmed)})`);
}
//# sourceMappingURL=chatgpt.js.map