const ASSESSMENT_PRIORITY = {
    unconfirmed: 0,
    challenge: 1,
    "signed-out": 2,
    authenticated: 3,
};
/** Preserve positive observations over later transient/unknown page states. */
export function strongerAuthenticationAssessment(current, next) {
    return ASSESSMENT_PRIORITY[next.state] >= ASSESSMENT_PRIORITY[current.state] ? next : current;
}
//# sourceMappingURL=authentication.js.map