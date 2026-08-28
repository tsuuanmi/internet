export type AuthenticationEvidence = "authenticated-surface" | "login-url" | "login-surface" | "challenge-url" | "challenge-surface" | "timeout";
/** Ephemeral provider evidence; only signed-out may change durable account state. */
export type AuthenticationAssessment = {
    state: "authenticated";
    evidence: "authenticated-surface";
} | {
    state: "signed-out";
    evidence: "login-url" | "login-surface";
} | {
    state: "challenge";
    evidence: "challenge-url" | "challenge-surface";
} | {
    state: "unconfirmed";
    evidence: "timeout";
};
/** Preserve positive observations over later transient/unknown page states. */
export declare function strongerAuthenticationAssessment(current: AuthenticationAssessment, next: AuthenticationAssessment): AuthenticationAssessment;
//# sourceMappingURL=authentication.d.ts.map