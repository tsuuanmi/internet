import type { Page } from "patchright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
import type { ChatGptThinkingLevel } from "#internet/core/config";
export declare const CHATGPT_HOME_URL = "https://chatgpt.com/";
export declare const CHATGPT_COMPOSER_SELECTOR: string;
export declare const CHATGPT_SEND_BUTTON_SELECTOR = "button.composer-submit-button-color[aria-label=\"Send prompt\"]";
export declare const CHATGPT_STOP_BUTTON_SELECTOR = "[data-testid=\"stop-button\"]";
export declare const CHATGPT_ACCOUNT_SELECTOR = "[data-testid=\"accounts-profile-button\"]";
/** The reasoning-level composer pill in the current ChatGPT UI. */
export declare const CHATGPT_EFFORT_CONTROL_SELECTOR = "button.__composer-pill.__composer-pill--neutral[aria-haspopup=\"menu\"][data-tone=\"neutral\"]:has(.text-token-text-tertiary)";
/** The open model/effort menu (menuitemradio list or reasoning-effort slider). */
export declare const CHATGPT_EFFORT_MENU_SELECTOR: string;
/** One reasoning-effort choice in the menu (Instant, Medium, High, …). */
export declare const CHATGPT_EFFORT_ITEM_SELECTOR = "[role=\"menuitemradio\"]";
/** The reasoning-effort slider control, when the account renders a slider. */
export declare const CHATGPT_EFFORT_SLIDER_SELECTOR = "[data-model-reasoning-effort-slider] [role=\"slider\"]";
/** ChatGPT exposes exactly three supported reasoning-effort options. */
export declare const CHATGPT_EFFORT_SLIDER_MAX_OPTIONS = 3;
/** UI index of each supported thinking level in the ChatGPT model switcher. */
export declare const CHATGPT_THINKING_LEVEL_INDEX: Record<ChatGptThinkingLevel, number>;
export declare const CHATGPT_ASSISTANT_TURN_SELECTOR: string;
/** True when ChatGPT exposes both its composer and signed-in account control. */
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
export interface ChatGptEffortSliderState {
    min: number;
    max: number;
    value: number;
}
/** Parse a reasoning-effort slider's ARIA range, or undefined when invalid. */
export declare function parseChatGptEffortSliderState(rawMin: string | null, rawMax: string | null, rawValue: string | null): ChatGptEffortSliderState | undefined;
/**
 * Select the ChatGPT reasoning-effort level before a turn. Opens the model
 * switcher and activates the target level, handling both the menuitemradio
 * list and the reasoning-effort slider surfaces. No-ops when the level is
 * already selected.
 */
export declare function chatgptSelectThinkingLevel(page: Page, level: ChatGptThinkingLevel): Promise<void>;
//# sourceMappingURL=chatgpt.d.ts.map