/**
 * Plugin-specific error taxonomy. Browser-backed web providers fail in a small
 * number of user-actionable ways (not logged in, browser unavailable,
 * timed out, or the provider refused a response), so the `internet_chat` tool
 * reports a structured kind back to the model and UI rather than a bare
 * message.
 */
export class InternetError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = "InternetError";
        this.kind = kind;
    }
}
export function isInternetError(error) {
    return error instanceof InternetError;
}
//# sourceMappingURL=errors.js.map