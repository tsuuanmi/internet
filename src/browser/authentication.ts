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

const ASSESSMENT_PRIORITY: Record<AuthenticationAssessment["state"], number> = {
	unconfirmed: 0,
	challenge: 1,
	"signed-out": 2,
	authenticated: 3,
};

/** Preserve positive observations over later transient/unknown page states. */
export function strongerAuthenticationAssessment(
	current: AuthenticationAssessment,
	next: AuthenticationAssessment,
): AuthenticationAssessment {
	return ASSESSMENT_PRIORITY[next.state] >= ASSESSMENT_PRIORITY[current.state] ? next : current;
}
