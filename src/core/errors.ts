/**
 * Plugin-specific error taxonomy. Browser-backed web providers fail in a small
 * number of user-actionable ways (not logged in, browser unavailable,
 * timed out, or the provider refused a response), so the `internet_chat` tool
 * reports a structured kind back to the model and UI rather than a bare
 * message.
 */

export type InternetErrorKind =
	| "browser_unavailable"
	| "login_required"
	| "login_failed"
	| "not_authenticated"
	| "timeout"
	| "aborted"
	| "provider_error"
	| "config_error";

export class InternetError extends Error {
	readonly kind: InternetErrorKind;

	constructor(kind: InternetErrorKind, message: string) {
		super(message);
		this.name = "InternetError";
		this.kind = kind;
	}
}

export function isInternetError(error: unknown): error is InternetError {
	return error instanceof InternetError;
}
