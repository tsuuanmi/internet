/** Stable semantic account identities used by workflow routing. */
export const ACCOUNT_IDS = ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"];
/** Coarse workflow role; capabilities provide the authoritative routing detail. */
export const ACCOUNT_ROLES = ["thinker", "writer"];
/** Capabilities the workflow runtime may require when selecting an account. */
export const ACCOUNT_CAPABILITIES = [
    "browser.chat",
    "team.reason",
    "team.review",
    "team.synthesize",
    "github.read",
    "github.write",
    "github.pull_request",
    "github.merge",
];
/**
 * Initial semantic account catalog. These definitions describe intended
 * workflow routing and authority boundaries; later multi-account work binds
 * each identity to isolated portable browser state.
 */
export const ACCOUNTS = {
    "chatgpt-thinker": {
        accountId: "chatgpt-thinker",
        provider: "chatgpt-web",
        role: "thinker",
        capabilities: ["browser.chat", "team.reason", "team.review", "team.synthesize", "github.read"],
    },
    "chatgpt-writer": {
        accountId: "chatgpt-writer",
        provider: "chatgpt-web",
        role: "writer",
        capabilities: ["browser.chat", "github.read", "github.write", "github.pull_request", "github.merge"],
    },
    "gemini-thinker": {
        accountId: "gemini-thinker",
        provider: "gemini-web",
        role: "thinker",
        capabilities: ["browser.chat", "team.reason", "team.review", "github.read"],
    },
};
export function isAccountId(value) {
    return typeof value === "string" && ACCOUNT_IDS.includes(value);
}
export function getAccountDefinition(accountId) {
    return ACCOUNTS[accountId];
}
export function accountHasCapability(accountId, capability) {
    return ACCOUNTS[accountId].capabilities.includes(capability);
}
/** Select known accounts that satisfy every requested capability. */
export function accountsWithCapabilities(required) {
    return ACCOUNT_IDS.map((accountId) => ACCOUNTS[accountId]).filter((account) => required.every((capability) => account.capabilities.includes(capability)));
}
//# sourceMappingURL=accounts.js.map