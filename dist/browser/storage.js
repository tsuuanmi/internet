import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
/** Compute the per-provider login-profile and storage-state paths under `dataDir`. */
export function providerLocations(dataDir, provider) {
    const profileDir = join(dataDir, provider, "login-profile");
    const storageStatePath = join(dataDir, provider, "storage-state.json");
    const verificationMarkerPath = join(dataDir, provider, "storage-state.verified.json");
    return { provider, profileDir, storageStatePath, verificationMarkerPath };
}
/** Ensure the directories that own a provider's browser state exist privately. */
export function ensureProviderDirectories(dataDir, provider) {
    const { profileDir, storageStatePath } = providerLocations(dataDir, provider);
    mkdirSync(dirname(storageStatePath), { recursive: true, mode: 0o700 });
    mkdirSync(profileDir, { recursive: true, mode: 0o700 });
}
//# sourceMappingURL=storage.js.map