import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

export type AuthenticationEvidence =
	| "authenticated-surface"
	| "login-url"
	| "login-surface"
	| "challenge-url"
	| "challenge-surface"
	| "timeout";

/** Ephemeral provider evidence; only signed-out may change durable account state. */
export type AuthenticationAssessment =
	| { state: "authenticated"; evidence: "authenticated-surface" }
	| { state: "signed-out"; evidence: "login-url" | "login-surface" }
	| { state: "challenge"; evidence: "challenge-url" | "challenge-surface" }
	| { state: "unconfirmed"; evidence: "timeout" };

/**
 * Preserve the latest conclusive observation over later transient/unknown
 * states. Authenticated is terminal; signed-out and challenge replace each
 * other (latest wins); unconfirmed never overrides a conclusive state.
 */
export function latestConclusiveAssessment(
	current: AuthenticationAssessment,
	next: AuthenticationAssessment,
): AuthenticationAssessment {
	if (current.state === "authenticated") return current;
	if (next.state === "authenticated") return next;
	if (next.state === "unconfirmed") return current;
	return next;
}

/**
 * Shared authentication polling. Samples a provider-specific assessment at
 * 200ms intervals until authenticated or the deadline expires, retaining the
 * latest conclusive observation. Aborts immediately on signal cancellation.
 */
export async function waitAuthenticationAssessment(
	assess: () => Promise<AuthenticationAssessment>,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<AuthenticationAssessment> {
	const deadline = Date.now() + timeoutMs;
	let latest = await assess();
	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
		}
		if (latest.state === "authenticated") return latest;
		await sleep(200, signal);
		latest = latestConclusiveAssessment(latest, await assess());
	}
	return latest;
}
