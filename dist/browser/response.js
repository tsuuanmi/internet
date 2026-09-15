import { htmlToMarkdown } from "#internet/core/markdown";
/** Render one already-completed semantic provider response for its caller. */
export function renderCompletedResponse(response, representation) {
    const text = response.text.trim();
    if (representation === "text")
        return text;
    return response.html.trim() === "" ? text : htmlToMarkdown(response.html);
}
//# sourceMappingURL=response.js.map