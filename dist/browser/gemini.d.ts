import type { Page } from "playwright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
export declare const GEMINI_HOME_URL = "https://gemini.google.com/app";
export declare const GEMINI_COMPOSER_SELECTOR = "rich-textarea [contenteditable=\"true\"]";
export declare const GEMINI_SEND_BUTTON_SELECTOR = "input-area-v2 button[aria-label=\"Send message\"]";
export declare const GEMINI_STOP_BUTTON_SELECTOR = "button[aria-label=\"Stop response\"]";
export declare const GEMINI_RESPONSE_SELECTOR = "model-response .model-response-text message-content .markdown.markdown-main-panel";
/** True when the Gemini home page exposes its composer. */
export declare function geminiIsAuthenticated(page: Page): Promise<boolean>;
/** Wait until Gemini is authenticated (composer visible), or return false. */
export declare function geminiWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
/** Fill the Gemini composer with the prompt and submit it. */
export declare function geminiSend(page: Page, prompt: string): Promise<void>;
/** Snapshot the newest Gemini response. */
export declare function geminiSnapshot(page: Page): Promise<CompletionSnapshot>;
//# sourceMappingURL=gemini.d.ts.map