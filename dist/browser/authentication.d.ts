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
/**
 * Preserve the latest conclusive observation over later transient/unknown
 * states. Authenticated is terminal; signed-out and challenge replace each
 * other (latest wins); unconfirmed never overrides a conclusive state.
 */
export declare function latestConclusiveAssessment(current: AuthenticationAssessment, next: AuthenticationAssessment): AuthenticationAssessment;
/**
 * Shared authentication polling. Samples a provider-specific assessment at
 * 200ms intervals until authenticated or the deadline expires, retaining the
 * latest conclusive observation. Aborts immediately on signal cancellation.
 */
export declare function waitAuthenticationAssessment(assess: () => Promise<AuthenticationAssessment>, timeoutMs: number, signal?: AbortSignal): Promise<AuthenticationAssessment>;
//# sourceMappingURL=authentication.d.ts.map