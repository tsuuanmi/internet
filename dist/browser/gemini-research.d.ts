import type { Page } from "patchright-core";
/** Enable Gemini Deep research and verify its active composer-mode button. */
export declare function geminiEnableDeepResearch(page: Page): Promise<void>;
/**
 * Gemini first generates a plan in Deep research mode. Confirm it using the
 * semantic Start research action before waiting for the final report.
 */
export declare function geminiStartResearchPlan(page: Page, options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<void>;
//# sourceMappingURL=gemini-research.d.ts.map