import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/**
 * Shared HTML-to-markdown converter for the rendered assistant response. Uses
 * turndown with GitHub-flavored tables/strikethrough, matching the pi
 * internet extension's markdown conventions and DSH's `dsh-tool-web` renderer.
 * The instance is stateless across calls and safe to share.
 */
const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	emDelimiter: "*",
});
turndown.use(gfm);
turndown.remove(["script", "style", "noscript"]);

/** Convert provider-rendered HTML to markdown text. */
export function htmlToMarkdown(html: string): string {
	return turndown.turndown(html).trim();
}
