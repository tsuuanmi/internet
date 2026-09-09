import { type Browser, chromium, type Page } from "patchright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geminiSnapshot } from "#internet/browser/gemini";

// Opt-in local browser contract tests; no network or authenticated account needed.
// GEMINI_DOM_TEST=1 npm test -- test/gemini-dom.test.ts
const errorText = "I encountered an error doing what you asked. Could you try again?";
const answer = (html: string) =>
	`<div class="model-response-text"><message-content><div class="markdown markdown-main-panel">${html}</div></message-content></div>`;
const turn = (html: string) => `<model-response>${html}</model-response>`;

describe.skipIf(process.env.GEMINI_DOM_TEST !== "1")("Gemini execution errors in real DOM", () => {
	let browser: Browser;
	let page: Page;
	beforeAll(async () => {
		browser = await chromium.launch({
			executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
			headless: true,
			args: ["--no-sandbox"],
		});
		page = await browser.newPage();
	});
	afterAll(async () => {
		await browser?.close();
	});

	async function load(html: string): Promise<void> {
		await page.setContent(
			`<style>model-response, message-content, response-error { display: block; } [hidden] { display: none; }</style>${html}`,
		);
	}

	it("throws for the observed whole-message execution failure", async () => {
		await load(turn(answer(errorText)));
		await expect(geminiSnapshot(page)).rejects.toMatchObject({ kind: "provider_error" });
	});

	it.each([
		"<response-error>Execution failed</response-error>",
		'<div class="error-container">Execution failed</div>',
		'<div data-test-id="error-message">Execution failed</div>',
		'<button aria-label="Try again">↻</button>',
	])("detects newest chrome without markdown: %s", async (chrome) => {
		await load(turn(answer("older answer")) + turn(chrome));
		await expect(geminiSnapshot(page, "older answer")).rejects.toMatchObject({ kind: "provider_error" });
	});

	it("ignores old and global error surfaces and hidden newest controls", async () => {
		await load(
			'<div class="error-container">Global unrelated error</div>' +
				turn(`${answer(errorText)}<button>Try again</button>`) +
				turn(
					answer("new answer") +
						'<button style="display:none">Retry</button><response-error hidden>Error</response-error>',
				),
		);
		await expect(geminiSnapshot(page, errorText)).resolves.toMatchObject({
			text: "new answer",
			responsePresent: true,
		});
	});

	it("ignores generated markup that resembles provider chrome", async () => {
		await load(turn(answer('<div class="error-container">Example error</div><button>Retry</button>')));
		await expect(geminiSnapshot(page)).resolves.toMatchObject({ responsePresent: true });
	});

	it.each(["blockquote", "pre", "code", "q"])("preserves whole templates quoted using %s", async (tag) => {
		await load(turn(answer(`<${tag}>${errorText}</${tag}>`)));
		await expect(geminiSnapshot(page)).resolves.toMatchObject({ responsePresent: true });
	});

	it("preserves normal refusals and regeneration actions", async () => {
		await load(turn(`${answer("I can't help with that request.")}<button aria-label="Regenerate">↻</button>`));
		await expect(geminiSnapshot(page)).resolves.toMatchObject({ responsePresent: true });
	});
});
