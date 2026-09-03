import type { Page } from "patchright-core";
import { type AuthenticationAssessment } from "#internet/browser/authentication";
import type { CompletionSnapshot } from "#internet/browser/completion";
export declare const GEMINI_HOME_URL = "https://gemini.google.com/app";
export declare const GEMINI_COMPOSER_SELECTOR = "rich-textarea [contenteditable=\"true\"]";
export declare const GEMINI_SEND_BUTTON_SELECTOR = "input-area-v2 button[aria-label=\"Send message\"]";
export declare const GEMINI_STOP_BUTTON_SELECTOR = "button[aria-label=\"Stop response\"]";
export declare const GEMINI_ACCOUNT_SELECTOR = "[aria-label^=\"Google Account\"], [aria-label*=\"Google Account:\"]";
export declare const GEMINI_RESPONSE_SELECTOR = "model-response .model-response-text message-content .markdown.markdown-main-panel";
/** Gemini's current provider-owned mode-picker trigger. */
export declare const GEMINI_MODE_PICKER_SELECTOR = "button[data-test-id=\"bard-mode-menu-button\"]";
export declare const GEMINI_MODE_MENU_ITEM_SELECTOR = "[role=\"menuitem\"]";
export declare const GEMINI_DEFAULT_FLASH_LABEL = "3.8 Flash";
export declare const GEMINI_DEFAULT_EXTENDED_LABEL = "Extended thinking";
export declare const GEMINI_DEEP_RESEARCH_REPORT_SELECTOR = "response-container structured-content-container[data-test-id=\"message-content\"] message-content #extended-response-markdown-content";
export declare const GEMINI_DEEP_RESEARCH_SOURCES_SELECTOR = "response-container deep-research-source-lists";
/** True when Gemini exposes both its composer and signed-in Google account control. */
export declare function geminiIsAuthenticated(page: Page): Promise<boolean>;
/** Assess Gemini auth without treating a missing composer as proof of logout. */
export declare function geminiAuthenticationAssessment(page: Page): Promise<AuthenticationAssessment>;
/** Wait for a conclusive Gemini auth surface or return the latest conclusive observation. */
export declare function geminiWaitAuthenticationAssessment(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<AuthenticationAssessment>;
/** Wait until Gemini is authenticated (composer visible), or return false. */
export declare function geminiWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
/**
 * Select the observed Gemini default before every ordinary turn: the latest
 * Flash model and Extended thinking. Gemini's UI renders a provider-owned
 * composer indicator after each action; do not assume a prior thread's mode.
 */
export declare function geminiSelectDefaultMode(page: Page): Promise<void>;
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
/** Read the previous completed Gemini Deep Research report, if any. */
export declare function geminiLastDeepResearchReportText(page: Page): Promise<string>;
/**
 * Gemini publishes a final report in an extended response surface rather than
 * its normal model-response stream. A non-busy report with the report's own
 * visible sources panel is the provider-owned completion contract.
 */
export declare function geminiDeepResearchSnapshot(page: Page, previousReportText?: string): Promise<CompletionSnapshot>;
//# sourceMappingURL=gemini.d.ts.map