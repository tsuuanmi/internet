/** Shared native-login/reopen policy for the same on-disk Chrome profile. */
export function loginProfileArgs() {
    return [
        // Chrome normally clears session cookies on a new session. Restore them
        // across Save account's native-Chrome -> automated-Chrome handoff.
        // Chromium ProfileImpl::ShouldRestoreOldSessionCookies gates this on
        // session restoration (or crash recovery), not just profile reuse.
        "--restore-last-session",
        "--disable-background-mode",
        "--no-first-run",
        "--no-default-browser-check",
    ];
}
/** Keep the native OS cookie encryption backend, not automation's basic store. */
export function loginProfileIgnoredDefaultArgs() {
    return ["--no-sandbox", "--password-store=basic", "--use-mock-keychain"];
}
/** Only the display changes at reopen; retain HOME, XDG and keyring/session env. */
export function loginProfileReopenEnv(loginEnv, displayEnv) {
    return { ...loginEnv, DISPLAY: displayEnv.DISPLAY, XAUTHORITY: displayEnv.XAUTHORITY };
}
//# sourceMappingURL=login-profile.js.map