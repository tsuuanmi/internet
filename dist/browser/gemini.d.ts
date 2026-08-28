import type { Page } from "patchright-core";
import { type AuthenticationAssessment } from "#internet/browser/authentication";
import type { CompletionSnapshot } from "#internet/browser/completion";
export declare const GEMINI_HOME_URL = "https://gemini.google.com/app";
export declare const GEMINI_COMPOSER_SELECTOR = "rich-textarea [contenteditable=\"true\"]";
export declare const GEMINI_SEND_BUTTON_SELECTOR = "input-area-v2 button[aria-label=\"Send message\"]";
export declare const GEMINI_STOP_BUTTON_SELECTOR = "button[aria-label=\"Stop response\"]";
export declare const GEMINI_ACCOUNT_SELECTOR = "[aria-label^=\"Google Account\"], [aria-label*=\"Google Account:\"]";
export declare const GEMINI_RESPONSE_SELECTOR = "model-response .model-response-text message-content .markdown.markdown-main-panel";
/** True when Gemini exposes both its composer and signed-in Google account control. */
export declare function geminiIsAuthenticated(page: Page): Promise<boolean>;
/** Assess Gemini auth without treating a missing composer as proof of logout. */
export declare function geminiAuthenticationAssessment(page: Page): Promise<AuthenticationAssessment>;
/** Wait for a conclusive Gemini auth surface and otherwise return the strongest observed state. */
export declare function geminiWaitAuthenticationAssessment(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<AuthenticationAssessment>;
/** Wait until Gemini is authenticated (composer visible), or return false. */
export declare function geminiWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
/** Fill the Gemini composer with the prompt and submit it. */
export declare function geminiSend(page: Page, prompt: string): Promise<void>;
/** Read the visible text of the current newest Gemini response (empty when none). */
export declare function geminiLastResponseText(page: Page): Promise<string>;
/**
 * Snapshot the newest Gemini response. Pass `previousTurnText` (the last
 * response's text captured before sending) so a response is only treated as
 * present once the newest response differs from it — robust to resuming a
 * durable conversation where the previous turn is already visible on the page.
 */
export declare function geminiSnapshot(page: Page, previousTurnText?: string): Promise<CompletionSnapshot>;
//# sourceMappingURL=gemini.d.ts.map