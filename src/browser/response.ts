import type { CompletedResponse } from "#internet/browser/completion";
import { htmlToMarkdown } from "#internet/core/markdown";

export type ResponseRepresentation = "markdown" | "text";

/** Render one already-completed semantic provider response for its caller. */
export function renderCompletedResponse(
	response: Pick<CompletedResponse, "text" | "html">,
	representation: ResponseRepresentation,
): string {
	const text = response.text.trim();
	if (representation === "text") return text;
	return response.html.trim() === "" ? text : htmlToMarkdown(response.html);
}
