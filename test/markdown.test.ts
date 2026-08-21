import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "#internet/core/markdown";

describe("htmlToMarkdown", () => {
	it("converts a paragraph and heading", () => {
		const markdown = htmlToMarkdown("<h2>Title</h2><p>Some <strong>bold</strong> text.</p>");
		expect(markdown).toContain("Title");
		expect(markdown).toContain("**bold**");
		expect(markdown).toContain("Some");
	});

	it("drops script/style content", () => {
		const markdown = htmlToMarkdown("<p>Keep</p><script>alert(1)</script><style>.x{}</style>");
		expect(markdown).toBe("Keep");
	});

	it("converts a GFM table", () => {
		const markdown = htmlToMarkdown(
			"<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>",
		);
		expect(markdown).toMatch(/\| Name \|/);
		expect(markdown).toMatch(/\| Value \|/);
	});
});
