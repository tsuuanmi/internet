import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WebProvider } from "#internet/core/config";

/** Resolved on-disk locations for one provider's isolated browser state. */
export interface ProviderLocations {
	provider: WebProvider;
	/** Temporary normal-Chrome profile used only for interactive login. */
	profileDir: string;
	/** Playwright storage-state JSON capturing cookies/local storage after login. */
	storageStatePath: string;
	/** Marker proving the exported state was checked against an authenticated page. */
	verificationMarkerPath: string;
}

/** Compute the per-provider login-profile and storage-state paths under `dataDir`. */
export function providerLocations(dataDir: string, provider: WebProvider): ProviderLocations {
	const profileDir = join(dataDir, provider, "login-profile");
	const storageStatePath = join(dataDir, provider, "storage-state.json");
	const verificationMarkerPath = join(dataDir, provider, "storage-state.verified.json");
	return { provider, profileDir, storageStatePath, verificationMarkerPath };
}

/** Ensure the directories that own a provider's browser state exist privately. */
export function ensureProviderDirectories(dataDir: string, provider: WebProvider): void {
	const { profileDir, storageStatePath } = providerLocations(dataDir, provider);
	mkdirSync(dirname(storageStatePath), { recursive: true, mode: 0o700 });
	mkdirSync(profileDir, { recursive: true, mode: 0o700 });
}
