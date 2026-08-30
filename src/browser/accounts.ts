import { existsSync, lstatSync, readFileSync } from "node:fs";
import type { BrowserContext } from "patchright-core";
import type { AuthenticationEvidence } from "#internet/browser/authentication";
import { providerLocations } from "#internet/browser/storage";
import type { WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
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

/** Non-secret evidence retained when positive sign-out proof invalidates an account. */
export interface ReauthDiagnostic {
	observedAt: string;
	evidence: Extract<AuthenticationEvidence, "login-url" | "login-surface">;
}

export interface AccountFile {
	schema: typeof ACCOUNT_SCHEMA;
	version: 1;
	provider: WebProvider;
	status: "ready" | "reauth-required";
	verifiedAt: string;
	/** Monotonic canonical snapshot version; legacy version-1 files normalize to 0. */
	revision: number;
	invalidatedAt?: string;
	reauthDiagnostic?: ReauthDiagnostic;
	storageState: PortableStorageState;
}

export interface AccountInspection {
	state: AccountState;
	path: string;
	account?: AccountFile;
	error?: string;
}

export interface PortableStorageCapture {
	storageState: PortableStorageState;
	indexedDbCaptured: boolean;
}

function isOversizedIndexedDbCaptureError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /Unable to serialize IndexedDB:\s*Failed to read large IndexedDB value/i.test(message);
}

/**
 * Capture portable state from a non-persistent inference context. Patchright
 * can reject an oversized IndexedDB value, so retain authenticated cookies and
 * local storage without exposing the rejected payload.
 */
export async function capturePortableStorageState(context: BrowserContext): Promise<PortableStorageCapture> {
	try {
		return {
			storageState: (await context.storageState({ indexedDB: true })) as PortableStorageState,
			indexedDbCaptured: true,
		};
	} catch (error) {
		if (!isOversizedIndexedDbCaptureError(error)) throw error;
	}
	try {
		return {
			storageState: (await context.storageState()) as PortableStorageState,
			indexedDbCaptured: false,
		};
	} catch {
		throw new InternetError("provider_error", "Browser account state could not be captured without IndexedDB.");
	}
}

/** Preserve prior IndexedDB data when a fallback snapshot omits it. */
export function preserveIndexedDb(
	storageState: PortableStorageState,
	previousStorageState: PortableStorageState,
): PortableStorageState {
	const previousByOrigin = new Map(
		previousStorageState.origins
			.filter((origin) => origin.indexedDB !== undefined)
			.map((origin) => [origin.origin, origin] as const),
	);
	const origins = storageState.origins.map((origin) => {
		const previous = previousByOrigin.get(origin.origin);
		if (previous?.indexedDB === undefined) return origin;
		previousByOrigin.delete(origin.origin);
		return { ...origin, indexedDB: previous.indexedDB };
	});
	for (const previous of previousByOrigin.values()) origins.push({ ...previous });
	return { ...storageState, origins };
}

/**
 * Capture the profile state needed to bootstrap a portable context. Patchright
 * cannot call storageState() on a native-keyring persistent Chrome profile, so
 * the verified fresh context performs the authoritative portable-state capture.
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
			revision: this.nextRevision(provider),
			storageState,
		};
		this.write(provider, account);
		return account;
	}

	/**
	 * Commit an inference snapshot only if it was bootstrapped from the current
	 * canonical revision. Storage state is opaque (including IndexedDB), so a
	 * stale full snapshot is discarded rather than unsafely merged.
	 */
	writeReadyIfRevision(
		provider: WebProvider,
		expectedRevision: number,
		storageState: PortableStorageState,
		verifiedAt = new Date(),
	): AccountFile | undefined {
		const inspection = this.inspect(provider);
		if (inspection.state !== "ready" || inspection.account?.revision !== expectedRevision) return undefined;
		const account: AccountFile = {
			...inspection.account,
			status: "ready",
			verifiedAt: verifiedAt.toISOString(),
			revision: expectedRevision + 1,
			storageState,
		};
		this.write(provider, account);
		return account;
	}

	markReauthRequired(
		provider: WebProvider,
		invalidatedAt = new Date(),
		reauthDiagnostic?: ReauthDiagnostic,
	): AccountFile | undefined {
		const inspection = this.inspect(provider);
		if (inspection.account === undefined) return undefined;
		const account: AccountFile = {
			...inspection.account,
			status: "reauth-required",
			invalidatedAt: invalidatedAt.toISOString(),
			reauthDiagnostic,
			revision: inspection.account.revision + 1,
		};
		this.write(provider, account);
		return account;
	}

	/**
	 * Invalidate only if the canonical account is still the bootstrapped
	 * revision. This prevents a stale or cancelled turn from overwriting a
	 * newer login or refreshed snapshot made through a different lease.
	 */
	markReauthRequiredIfRevision(
		provider: WebProvider,
		expectedRevision: number,
		invalidatedAt = new Date(),
		reauthDiagnostic?: ReauthDiagnostic,
	): AccountFile | undefined {
		const inspection = this.inspect(provider);
		if (inspection.account === undefined || inspection.account.revision !== expectedRevision) return undefined;
		const account: AccountFile = {
			...inspection.account,
			status: "reauth-required",
			invalidatedAt: invalidatedAt.toISOString(),
			reauthDiagnostic,
			revision: inspection.account.revision + 1,
		};
		this.write(provider, account);
		return account;
	}

	private nextRevision(provider: WebProvider): number {
		const revision = this.inspect(provider).account?.revision;
		return (revision ?? 0) + 1;
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
	if (
		value.revision !== undefined &&
		(typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0)
	) {
		throw new Error("invalid account revision");
	}
	if (value.status === "ready" && (value.invalidatedAt !== undefined || value.reauthDiagnostic !== undefined)) {
		throw new Error("ready account must not have invalidation data");
	}
	if (value.status === "reauth-required" && !isTimestamp(value.invalidatedAt)) {
		throw new Error("invalid account invalidation timestamp");
	}
	if (value.reauthDiagnostic !== undefined && !isReauthDiagnostic(value.reauthDiagnostic)) {
		throw new Error("invalid account reauthentication diagnostic");
	}
	if (!isPortableStorageState(value.storageState)) throw new Error("invalid account storage state");
	return { ...value, revision: value.revision ?? 0 } as unknown as AccountFile;
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

function isReauthDiagnostic(value: unknown): value is ReauthDiagnostic {
	if (!isRecord(value)) return false;
	return (
		isTimestamp(value.observedAt) &&
		(value.evidence === "login-url" || value.evidence === "login-surface") &&
		Object.keys(value).length === 2
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
