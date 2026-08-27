import { existsSync, lstatSync, readFileSync } from "node:fs";
import type { BrowserContext } from "patchright-core";
import { providerLocations } from "#internet/browser/storage";
import type { WebProvider } from "#internet/core/config";
import { writePrivateJson } from "#internet/core/private-json";

const ACCOUNT_SCHEMA = "@tsuuanmi/internet-account";

type NativeStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type NativeOriginState = NativeStorageState["origins"][number];

/** Patchright storage state with its runtime-supported IndexedDB payload. */
export interface PortableStorageState {
	cookies: NativeStorageState["cookies"];
	origins: Array<NativeOriginState & { indexedDB?: unknown[] }>;
}

export const ACCOUNT_STATES = ["missing", "ready", "reauth-required", "invalid"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export interface AccountFile {
	schema: typeof ACCOUNT_SCHEMA;
	version: 1;
	provider: WebProvider;
	status: "ready" | "reauth-required";
	verifiedAt: string;
	invalidatedAt?: string;
	storageState: PortableStorageState;
}

export interface AccountInspection {
	state: AccountState;
	path: string;
	account?: AccountFile;
	error?: string;
}

/** Capture complete portable state from a non-persistent inference context. */
export async function capturePortableStorageState(context: BrowserContext): Promise<PortableStorageState> {
	return (await context.storageState({ indexedDB: true })) as PortableStorageState;
}

/**
 * Capture the profile state needed to bootstrap a portable context. Patchright
 * cannot call storageState() on a native-keyring persistent Chrome profile, so
 * the verified fresh context performs the authoritative IndexedDB capture.
 */
export async function captureProfileBootstrapState(context: BrowserContext): Promise<PortableStorageState> {
	const cookies = await context.cookies();
	const origins: PortableStorageState["origins"] = [];
	const seen = new Set<string>();
	for (const page of context.pages()) {
		if (page.isClosed()) continue;
		try {
			const url = new URL(page.url());
			if (!url.protocol.startsWith("http") || seen.has(url.origin)) continue;
			const localStorage = await page.evaluate<Array<{ name: string; value: string }>>(
				"Object.keys(window.localStorage).map(name => ({ name, value: window.localStorage.getItem(name) ?? '' }))",
			);
			origins.push({ origin: url.origin, localStorage });
			seen.add(url.origin);
		} catch {
			// A page may navigate or close while its bootstrap state is read.
		}
	}
	return { cookies, origins };
}

/** Owns the canonical portable account files for all configured providers. */
export class AccountStore {
	private readonly dataDir: string;

	constructor(dataDir: string) {
		this.dataDir = dataDir;
	}

	inspect(provider: WebProvider): AccountInspection {
		const path = providerLocations(this.dataDir, provider).accountPath;
		if (!existsSync(path)) return { state: "missing", path };
		try {
			const stat = lstatSync(path);
			if (!stat.isFile()) throw new Error("account path is not a regular file");
			if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
				throw new Error("account file permissions must be 0600");
			}
			const account = parseAccountFile(JSON.parse(readFileSync(path, "utf8")), provider);
			return { state: account.status, path, account };
		} catch (error) {
			return {
				state: "invalid",
				path,
				error: error instanceof Error ? error.message : "invalid account file",
			};
		}
	}

	writeReady(provider: WebProvider, storageState: PortableStorageState, verifiedAt = new Date()): AccountFile {
		const account: AccountFile = {
			schema: ACCOUNT_SCHEMA,
			version: 1,
			provider,
			status: "ready",
			verifiedAt: verifiedAt.toISOString(),
			storageState,
		};
		this.write(provider, account);
		return account;
	}

	markReauthRequired(provider: WebProvider, invalidatedAt = new Date()): AccountFile | undefined {
		const inspection = this.inspect(provider);
		if (inspection.account === undefined) return undefined;
		const account: AccountFile = {
			...inspection.account,
			status: "reauth-required",
			invalidatedAt: invalidatedAt.toISOString(),
		};
		this.write(provider, account);
		return account;
	}

	private write(provider: WebProvider, account: AccountFile): void {
		writePrivateJson(providerLocations(this.dataDir, provider).accountPath, account);
	}
}

export function parseAccountFile(value: unknown, provider: WebProvider): AccountFile {
	if (!isRecord(value)) throw new Error("account file must be an object");
	if (value.schema !== ACCOUNT_SCHEMA || value.version !== 1) throw new Error("unsupported account file schema");
	if (value.provider !== provider) throw new Error(`account file belongs to ${String(value.provider)}`);
	if (value.status !== "ready" && value.status !== "reauth-required") throw new Error("invalid account status");
	if (!isTimestamp(value.verifiedAt)) throw new Error("invalid account verification timestamp");
	if (value.status === "ready" && value.invalidatedAt !== undefined) {
		throw new Error("ready account must not have an invalidation timestamp");
	}
	if (value.status === "reauth-required" && !isTimestamp(value.invalidatedAt)) {
		throw new Error("invalid account invalidation timestamp");
	}
	if (!isPortableStorageState(value.storageState)) throw new Error("invalid account storage state");
	return value as unknown as AccountFile;
}

function isPortableStorageState(value: unknown): value is PortableStorageState {
	if (!isRecord(value) || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) return false;
	return (
		value.cookies.every(
			(cookie) =>
				isRecord(cookie) &&
				typeof cookie.name === "string" &&
				typeof cookie.value === "string" &&
				typeof cookie.domain === "string" &&
				typeof cookie.path === "string" &&
				typeof cookie.expires === "number" &&
				typeof cookie.httpOnly === "boolean" &&
				typeof cookie.secure === "boolean" &&
				(cookie.sameSite === "Strict" || cookie.sameSite === "Lax" || cookie.sameSite === "None"),
		) &&
		value.origins.every(
			(origin) =>
				isRecord(origin) &&
				typeof origin.origin === "string" &&
				Array.isArray(origin.localStorage) &&
				origin.localStorage.every(
					(item) => isRecord(item) && typeof item.name === "string" && typeof item.value === "string",
				) &&
				(origin.indexedDB === undefined || Array.isArray(origin.indexedDB)),
		)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new Date(value).toISOString() === value;
	} catch {
		return false;
	}
}
