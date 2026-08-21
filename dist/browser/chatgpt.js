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
export const CHATGPT_ASSISTANT_TURN_SELECTOR = [
    '[data-testid^="conversation-turn-"][data-turn="assistant"]',
    '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
].join(", ");
/** True when the ChatGPT home page exposes its (single visible) composer. */
export async function chatgptIsAuthenticated(page) {
    const composers = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true });
    return (await composers.count()) === 1;
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
    await sendButton.waitFor({ state: "visible", timeout: 20_000 });
    if (!(await sendButton.isEnabled())) {
        throw new InternetError("provider_error", "ChatGPT send button is disabled after attaching the prompt");
    }
    await sendButton.click();
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
//# sourceMappingURL=chatgpt.js.map