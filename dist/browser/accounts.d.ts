import type { BrowserContext } from "patchright-core";
import type { WebProvider } from "#internet/core/config";
declare const ACCOUNT_SCHEMA = "@tsuuanmi/internet-account";
type NativeStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type NativeOriginState = NativeStorageState["origins"][number];
/** Patchright storage state with its runtime-supported IndexedDB payload. */
export interface PortableStorageState {
    cookies: NativeStorageState["cookies"];
    origins: Array<NativeOriginState & {
        indexedDB?: unknown[];
    }>;
}
export declare const ACCOUNT_STATES: readonly ["missing", "ready", "reauth-required", "invalid"];
export type AccountState = (typeof ACCOUNT_STATES)[number];
export interface AccountFile {
    schema: typeof ACCOUNT_SCHEMA;
    version: 1;
    provider: WebProvider;
    status: "ready" | "reauth-required";
    verifiedAt: string;
    /** Monotonic canonical snapshot version; legacy version-1 files normalize to 0. */
    revision: number;
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
export declare function capturePortableStorageState(context: BrowserContext): Promise<PortableStorageState>;
/**
 * Capture the profile state needed to bootstrap a portable context. Patchright
 * cannot call storageState() on a native-keyring persistent Chrome profile, so
 * the verified fresh context performs the authoritative IndexedDB capture.
 */
export declare function captureProfileBootstrapState(context: BrowserContext): Promise<PortableStorageState>;
/** Owns the canonical portable account files for all configured providers. */
export declare class AccountStore {
    private readonly dataDir;
    constructor(dataDir: string);
    inspect(provider: WebProvider): AccountInspection;
    writeReady(provider: WebProvider, storageState: PortableStorageState, verifiedAt?: Date): AccountFile;
    /**
     * Commit an inference snapshot only if it was bootstrapped from the current
     * canonical revision. Storage state is opaque (including IndexedDB), so a
     * stale full snapshot is discarded rather than unsafely merged.
     */
    writeReadyIfRevision(provider: WebProvider, expectedRevision: number, storageState: PortableStorageState, verifiedAt?: Date): AccountFile | undefined;
    markReauthRequired(provider: WebProvider, invalidatedAt?: Date): AccountFile | undefined;
    private nextRevision;
    private write;
}
export declare function parseAccountFile(value: unknown, provider: WebProvider): AccountFile;
export {};
//# sourceMappingURL=accounts.d.ts.map