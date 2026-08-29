import type { Page } from "patchright-core";
import type { CompletionSnapshot } from "#internet/browser/completion";
/** Enable ChatGPT Deep Research and verify its provider-owned composer pill. */
export declare function chatgptEnableDeepResearch(page: Page): Promise<void>;
/** Append a research question without replacing the verified Deep Research pill. */
export declare function chatgptSendDeepResearch(page: Page, prompt: string): Promise<void>;
/**
 * Read the nested report frame. ChatGPT renders Deep Research outside the
 * normal assistant-turn surface, and its Export control exists only once a
 * report is published; it is the provider-owned completion affordance.
 */
export declare function chatgptDeepResearchSnapshot(page: Page, previousReportText?: string): Promise<CompletionSnapshot>;
//# sourceMappingURL=chatgpt-research.d.ts.map