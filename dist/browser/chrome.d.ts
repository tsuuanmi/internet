/**
 * Resolve a usable Chrome binary. Prefers an explicit `chromePath`, then known
 * system locations, then Playwright's bundled Chromium as a last resort. The
 * plugin drives an isolated Chrome; it never reuses the DSH GUI browser.
 */
export declare function discoverChrome(executablePath?: string): string;
//# sourceMappingURL=chrome.d.ts.map