import type { WebProvider } from "#internet/core/config";
/** Stable semantic account identities used by workflow routing. */
export declare const ACCOUNT_IDS: readonly ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"];
export type AccountId = (typeof ACCOUNT_IDS)[number];
/** Coarse workflow role; capabilities provide the authoritative routing detail. */
export declare const ACCOUNT_ROLES: readonly ["thinker", "writer"];
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
/** Capabilities the workflow runtime may require when selecting an account. */
export declare const ACCOUNT_CAPABILITIES: readonly ["browser.chat", "team.reason", "team.review", "team.synthesize", "github.read", "github.write", "github.pull_request", "github.merge"];
export type AccountCapability = (typeof ACCOUNT_CAPABILITIES)[number];
export interface AccountDefinition {
    accountId: AccountId;
    provider: WebProvider;
    role: AccountRole;
    capabilities: readonly AccountCapability[];
}
/**
 * Initial semantic account catalog. These definitions describe intended
 * workflow routing and authority boundaries; later multi-account work binds
 * each identity to isolated portable browser state.
 */
export declare const ACCOUNTS: Readonly<Record<AccountId, AccountDefinition>>;
/**
 * Compatibility route for existing provider-keyed APIs while the browser
 * runtime migrates to first-class account IDs. Existing ChatGPT/Gemini calls
 * continue to address the thinker accounts; the writer is never selected
 * implicitly from a provider name.
 */
export declare const DEFAULT_ACCOUNT_BY_PROVIDER: Readonly<Record<WebProvider, AccountId>>;
export declare function isAccountId(value: unknown): value is AccountId;
export declare function getAccountDefinition(accountId: AccountId): AccountDefinition;
export declare function defaultAccountIdForProvider(provider: WebProvider): AccountId;
/** Return every semantic account backed by one provider in stable catalog order. */
export declare function accountsForProvider(provider: WebProvider): AccountDefinition[];
export declare function accountHasCapability(accountId: AccountId, capability: AccountCapability): boolean;
/** Select known accounts that satisfy every requested capability. */
export declare function accountsWithCapabilities(required: readonly AccountCapability[]): AccountDefinition[];
//# sourceMappingURL=accounts.d.ts.map