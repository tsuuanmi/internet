import type { CompletedResponse } from "#internet/browser/completion";
export type ResponseRepresentation = "markdown" | "text";
/** Render one already-completed semantic provider response for its caller. */
export declare function renderCompletedResponse(response: Pick<CompletedResponse, "text" | "html">, representation: ResponseRepresentation): string;
//# sourceMappingURL=response.d.ts.map