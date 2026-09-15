/**
 * Plugin-specific error taxonomy. Browser-backed providers fail in a small
 * number of user-actionable ways, so tools receive a structured kind instead
 * of relying on message parsing.
 */
export type InternetErrorKind = "browser_unavailable" | "login_required" | "login_failed" | "not_authenticated" | "timeout" | "provider_stalled" | "aborted" | "provider_error" | "config_error";
export declare class InternetError extends Error {
    readonly kind: InternetErrorKind;
    constructor(kind: InternetErrorKind, message: string);
}
export declare function isInternetError(error: unknown): error is InternetError;
//# sourceMappingURL=errors.d.ts.map