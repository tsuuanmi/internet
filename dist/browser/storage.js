import { join } from "node:path";
import { ensurePrivateDirectory } from "#internet/core/private-json";
/** Compute provider paths under the configured DSH internet data directory. */
export function providerLocations(dataDir, provider) {
    return {
        provider,
        profileDir: join(dataDir, provider, "login-profile"),
        accountPath: join(dataDir, "accounts", `${provider}.json`),
    };
}
/** Ensure the machine-local login profile directory exists privately. */
export function ensureLoginProfileDirectory(dataDir, provider) {
    ensurePrivateDirectory(providerLocations(dataDir, provider).profileDir);
}
//# sourceMappingURL=storage.js.map