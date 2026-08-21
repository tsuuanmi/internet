import type { Page } from "playwright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
export declare const CHATGPT_HOME_URL = "https://chatgpt.com/";
export declare const CHATGPT_COMPOSER_SELECTOR: string;
export declare const CHATGPT_SEND_BUTTON_SELECTOR = "button[data-testid=\"send-button\"]";
export declare const CHATGPT_STOP_BUTTON_SELECTOR = "[data-testid=\"stop-button\"]";
export declare const CHATGPT_ASSISTANT_TURN_SELECTOR: string;
/** True when the ChatGPT home page exposes its (single visible) composer. */
export declare function chatgptIsAuthenticated(page: Page): Promise<boolean>;
/** Wait until ChatGPT is authenticated (composer visible), or return false. */
export declare function chatgptWaitAuthenticated(page: Page, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
/** Fill the ChatGPT composer with the prompt and submit it. */
export declare function chatgptSend(page: Page, prompt: string): Promise<void>;
/** Read the visible text of the current newest ChatGPT assistant turn (empty when none). */
export declare function chatgptLastAssistantTurnText(page: Page): Promise<string>;
/**
 * Snapshot the newest assistant turn. Pass `previousTurnText` (the last turn's
 * text captured before sending) so a response is only treated as present once
 * the newest turn differs from it — robust to ChatGPT virtualizing/recycling
 * turns so the visible count does not increase on continuation.
 */
export declare function chatgptSnapshot(page: Page, previousTurnText?: string): Promise<CompletionSnapshot>;
//# sourceMappingURL=chatgpt.d.ts.map