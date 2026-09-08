import type { AccountId } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
/** Resolved local-profile and portable-account paths for one authenticated account. */
export interface AccountLocations {
    accountId: AccountId;
    provider: WebProvider;
    /** Machine-local normal-Chrome profile used only for interactive login. */
    profileDir: string;
    /** Canonical, copyable account state used by automated browser contexts. */
    accountPath: string;
}
/** Compute account-scoped paths under the configured DSH internet data directory. */
export declare function accountLocations(dataDir: string, accountId: AccountId): AccountLocations;
/** Ensure the machine-local login profile directory exists privately. */
export declare function ensureLoginProfileDirectory(dataDir: string, accountId: AccountId): void;
//# sourceMappingURL=storage.d.ts.map