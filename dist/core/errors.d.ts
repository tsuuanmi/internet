/**
 * Plugin-specific error taxonomy. Browser-backed web providers fail in a small
 * number of user-actionable ways (not logged in, browser unavailable,
 * timed out, or the provider refused a response), so the `browser_chat` tool
 * reports a structured kind back to the model and UI rather than a bare
 * message.
 */
export type InternetErrorKind = "browser_unavailable" | "login_required" | "login_failed" | "not_authenticated" | "timeout" | "aborted" | "provider_error" | "config_error";
export declare class InternetError extends Error {
    readonly kind: InternetErrorKind;
    constructor(kind: InternetErrorKind, message: string);
}
export declare function isInternetError(error: unknown): error is InternetError;
//# sourceMappingURL=errors.d.ts.map