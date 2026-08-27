import type { WebProvider } from "#internet/core/config";
/** Resolved local-profile and portable-account paths for one provider. */
export interface ProviderLocations {
    provider: WebProvider;
    /** Machine-local normal-Chrome profile used only for interactive login. */
    profileDir: string;
    /** Canonical, copyable account state used by automated browser contexts. */
    accountPath: string;
}
/** Compute provider paths under the configured DSH internet data directory. */
export declare function providerLocations(dataDir: string, provider: WebProvider): ProviderLocations;
/** Ensure the machine-local login profile directory exists privately. */
export declare function ensureLoginProfileDirectory(dataDir: string, provider: WebProvider): void;
//# sourceMappingURL=storage.d.ts.map