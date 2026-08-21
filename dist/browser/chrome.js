import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { InternetError } from "#internet/core/errors";
const CANDIDATES = [
    process.env.GOOGLE_CHROME_BIN ?? "",
    process.env.CHROME_PATH ?? "",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter((path) => path.length > 0);
/**
 * Resolve a usable Chrome binary. Prefers an explicit `chromePath`, then known
 * system locations, then Playwright's bundled Chromium as a last resort. The
 * plugin drives an isolated Chrome; it never reuses the DSH GUI browser.
 */
export function discoverChrome(executablePath) {
    if (executablePath !== undefined) {
        if (!existsSync(executablePath)) {
            throw new InternetError("browser_unavailable", `internet plugin Chrome path does not exist: ${executablePath}`);
        }
        return executablePath;
    }
    for (const candidate of CANDIDATES) {
        if (existsSync(candidate))
            return candidate;
    }
    try {
        const bundled = chromium.executablePath();
        if (bundled.length > 0 && existsSync(bundled))
            return bundled;
    }
    catch {
        // Playwright's bundled path is unavailable; fall through to the error below.
    }
    throw new InternetError("browser_unavailable", "Google Chrome was not found. Install Chrome or set chromePath in the internet plugin config.");
}
//# sourceMappingURL=chrome.js.map