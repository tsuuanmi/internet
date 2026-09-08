import { join } from "node:path";
import { getAccountDefinition } from "#internet/core/accounts";
import { ensurePrivateDirectory } from "#internet/core/private-json";
/** Compute account-scoped paths under the configured DSH internet data directory. */
export function accountLocations(dataDir, accountId) {
    const provider = getAccountDefinition(accountId).provider;
    return {
        accountId,
        provider,
        profileDir: join(dataDir, accountId, "login-profile"),
        accountPath: join(dataDir, "accounts", `${accountId}.json`),
    };
}
/** Ensure the machine-local login profile directory exists privately. */
export function ensureLoginProfileDirectory(dataDir, accountId) {
    ensurePrivateDirectory(accountLocations(dataDir, accountId).profileDir);
}
//# sourceMappingURL=storage.js.map