import { join } from "node:path";
import type { WebProvider } from "#internet/core/config";
import { ensurePrivateDirectory } from "#internet/core/private-json";

/** Resolved local-profile and portable-account paths for one provider. */
export interface ProviderLocations {
	provider: WebProvider;
	/** Machine-local normal-Chrome profile used only for interactive login. */
	profileDir: string;
	/** Canonical, copyable account state used by automated browser contexts. */
	accountPath: string;
}

/** Compute provider paths under the configured DSH internet data directory. */
export function providerLocations(dataDir: string, provider: WebProvider): ProviderLocations {
	return {
		provider,
		profileDir: join(dataDir, provider, "login-profile"),
		accountPath: join(dataDir, "accounts", `${provider}.json`),
	};
}

/** Ensure the machine-local login profile directory exists privately. */
export function ensureLoginProfileDirectory(dataDir: string, provider: WebProvider): void {
	ensurePrivateDirectory(providerLocations(dataDir, provider).profileDir);
}
