import type { WebProvider } from "#internet/core/config";
/** Resolved on-disk locations for one provider's isolated browser state. */
export interface ProviderLocations {
    provider: WebProvider;
    /** Temporary normal-Chrome profile used only for interactive login. */
    profileDir: string;
    /** patchright storage-state JSON capturing cookies/local storage after login. */
    storageStatePath: string;
    /** Marker proving the exported state was checked against an authenticated page. */
    verificationMarkerPath: string;
}
/** Compute the per-provider login-profile and storage-state paths under `dataDir`. */
export declare function providerLocations(dataDir: string, provider: WebProvider): ProviderLocations;
/** Ensure the directories that own a provider's browser state exist privately. */
export declare function ensureProviderDirectories(dataDir: string, provider: WebProvider): void;
//# sourceMappingURL=storage.d.ts.map