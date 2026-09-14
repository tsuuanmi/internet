/**
 * Plugin-specific error taxonomy. Browser-backed providers fail in a small
 * number of user-actionable ways, so tools receive a structured kind instead
 * of relying on message parsing.
 */
export type InternetErrorKind =
	| "browser_unavailable"
	| "login_required"
	| "login_failed"
	| "not_authenticated"
	| "timeout"
	| "provider_stalled"
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
