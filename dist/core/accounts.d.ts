import type { WebProvider } from "#internet/core/config";
/** Stable semantic account identities used by workflow routing. */
export declare const ACCOUNT_IDS: readonly ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker", "chatgpt-thinker-2"];
export type AccountId = (typeof ACCOUNT_IDS)[number];
/** Default independent reasoning members used by team/workflow execution. */
export declare const DEFAULT_TEAM_ACCOUNTS: readonly [AccountId, AccountId];
export declare const DEFAULT_TEAM_SYNTHESIZER: AccountId;
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
/** Authenticated account catalog. Team roles are assigned by ordered membership, not provider identity. */
export declare const ACCOUNTS: Readonly<Record<AccountId, AccountDefinition>>;
export declare function isAccountId(value: unknown): value is AccountId;
export declare function getAccountDefinition(accountId: AccountId): AccountDefinition;
/** Return every semantic account backed by one provider in stable catalog order. */
export declare function accountsForProvider(provider: WebProvider): AccountDefinition[];
export declare function accountHasCapability(accountId: AccountId, capability: AccountCapability): boolean;
/** Select known accounts that satisfy every requested capability. */
export declare function accountsWithCapabilities(required: readonly AccountCapability[]): AccountDefinition[];
//# sourceMappingURL=accounts.d.ts.map