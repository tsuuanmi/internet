import { randomUUID } from "node:crypto";
import { BrowserManager } from "../dist/browser/runtime.js";
import { resolveBrowserConfig } from "../dist/core/config.js";

// Explicit opt-in: uses real signed-in accounts and sends two harmless prompts
// per account. Run only while workflow/browser work on these accounts is idle.
const accounts = process.argv.slice(2);
const allowed = ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"];
if (!accounts.length || accounts.some((account) => !allowed.includes(account))) {
	throw new Error(`Usage: node scripts/smoke-browser.mjs <${allowed.join("| ")}> [...]`);
}
const browser = new BrowserManager(resolveBrowserConfig({}));
const runId = randomUUID();
let failed = false;
try {
	for (const account of new Set(accounts)) {
		const sessionId = `browser-smoke:${runId}:${account}`;
		const marker = `SMOKE${runId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
		const started = Date.now();
		try {
			const first = await browser.chat(account, {
				sessionId,
				visible: true,
				prompt: `Smoke test only. Do not browse, research, use tools, or modify files. Remember this marker for my next message: ${marker}. Reply with exactly: NOTED ${marker}`,
			});
			if (!first.text.includes(marker) || !first.conversationId) {
				throw new Error("First turn did not return the marker and a bound conversation ID.");
			}
			// The follow-up answer must differ textually from the previous turn's
			// answer: a completion snapshot legitimately treats an identical text
			// as the still-previous response. The prompt deliberately omits the
			// marker so echoing it proves real remembered context.
			const second = await browser.chat(account, {
				sessionId,
				visible: true,
				prompt:
					"Smoke test follow-up. Do not browse, research, or use tools. Reply with exactly: CONFIRMED <the marker from my previous message>",
			});
			if (!second.text.includes(marker) || second.conversationId !== first.conversationId) {
				throw new Error("Follow-up did not preserve the marker and conversation binding.");
			}
			console.log(JSON.stringify({
				account, ok: true, turns: 2, elapsedMs: Date.now() - started,
				url: second.url, conversationId: second.conversationId,
			}));
		} catch (error) {
			failed = true;
			console.error(JSON.stringify({
				account, ok: false, elapsedMs: Date.now() - started,
				error: error instanceof Error ? error.message : String(error),
			}));
		}
	}
} finally {
	await browser.dispose();
}
if (failed) process.exitCode = 1;
