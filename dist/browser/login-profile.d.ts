/** Shared native-login/reopen policy for the same on-disk Chrome profile. */
export declare function loginProfileArgs(): string[];
/** Keep the native OS cookie encryption backend, not automation's basic store. */
export declare function loginProfileIgnoredDefaultArgs(): string[];
/** Only the display changes at reopen; retain HOME, XDG and keyring/session env. */
export declare function loginProfileReopenEnv(loginEnv: NodeJS.ProcessEnv, displayEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
//# sourceMappingURL=login-profile.d.ts.map