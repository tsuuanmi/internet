import { join } from "node:path";
import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
import { ensurePrivateDirectory } from "#internet/core/private-json";

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
export function accountLocations(dataDir: string, accountId: AccountId): AccountLocations {
	const provider = getAccountDefinition(accountId).provider;
	return {
		accountId,
		provider,
		profileDir: join(dataDir, accountId, "login-profile"),
		accountPath: join(dataDir, "accounts", `${accountId}.json`),
	};
}

/** Ensure the machine-local login profile directory exists privately. */
export function ensureLoginProfileDirectory(dataDir: string, accountId: AccountId): void {
	ensurePrivateDirectory(accountLocations(dataDir, accountId).profileDir);
}
