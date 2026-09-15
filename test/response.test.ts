import { describe, expect, it } from "vitest";
import { renderCompletedResponse } from "#internet/browser/response";

describe("renderCompletedResponse", () => {
	it("preserves machine-readable semantic text exactly", () => {
		const text = '{"status":"PR_OPEN","repository":"example/repo"}';
		expect(renderCompletedResponse({ text, html: `<p>${text}</p>` }, "text")).toBe(text);
	});

	it("still renders ordinary provider HTML as Markdown", () => {
		expect(
			renderCompletedResponse(
				{ text: "Important answer", html: "<p><strong>Important</strong> answer</p>" },
				"markdown",
			),
		).toBe("**Important** answer");
	});
});
