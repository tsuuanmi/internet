import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	AccountStore,
	capturePortableStorageState,
	captureProfileBootstrapState,
	type PortableStorageState,
	parseAccountFile,
} from "#internet/browser/accounts";
import { providerLocations } from "#internet/browser/storage";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "internet-accounts-"));
	temporaryRoots.push(root);
	return root;
}

function storageState(indexedDB: unknown[] = []): PortableStorageState {
	return {
		cookies: [
			{
				name: "session",
				value: "secret",
				domain: ".example.com",
				path: "/",
				expires: -1,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
			},
		],
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "account", value: "one" }],
				indexedDB,
			},
		],
	};
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("AccountStore", () => {
	it.each(["chatgpt-web", "gemini-web"] as const)("persists a private portable %s account", (provider) => {
		const root = temporaryRoot();
		const store = new AccountStore(root);
		const indexedDB = [{ name: "auth", version: 1, stores: [] }];
		store.writeReady(provider, storageState(indexedDB), new Date("2026-01-02T03:04:05.000Z"));

		const inspection = store.inspect(provider);
		expect(inspection.state).toBe("ready");
		expect(inspection.account).toMatchObject({
			schema: "@tsuuanmi/internet-account",
			version: 1,
			provider,
			status: "ready",
			verifiedAt: "2026-01-02T03:04:05.000Z",
			revision: 1,
		});
		expect(inspection.account?.storageState.origins[0]?.indexedDB).toEqual(indexedDB);
		if (process.platform !== "win32") {
			expect(statSync(dirname(inspection.path)).mode & 0o777).toBe(0o700);
			expect(statSync(inspection.path).mode & 0o777).toBe(0o600);
		}
	});

	it("distinguishes missing, invalid, and reauthentication-required accounts", () => {
		const root = temporaryRoot();
		const store = new AccountStore(root);
		expect(store.inspect("chatgpt-web").state).toBe("missing");

		store.writeReady("chatgpt-web", storageState());
		store.markReauthRequired("chatgpt-web", new Date("2026-02-03T04:05:06.000Z"), {
			observedAt: "2026-02-03T04:05:06.000Z",
			evidence: "login-url",
		});
		expect(store.inspect("chatgpt-web")).toMatchObject({
			state: "reauth-required",
			account: {
				status: "reauth-required",
				invalidatedAt: "2026-02-03T04:05:06.000Z",
				reauthDiagnostic: { evidence: "login-url" },
			},
		});
		store.writeReady("chatgpt-web", storageState());
		expect(store.inspect("chatgpt-web").account?.reauthDiagnostic).toBeUndefined();

		const path = providerLocations(root, "chatgpt-web").accountPath;
		writeFileSync(path, "not json", { mode: 0o600 });
		expect(store.inspect("chatgpt-web")).toMatchObject({ state: "invalid", error: expect.any(String) });
	});

	it("normalizes legacy version-one accounts without a revision", () => {
		const account = parseAccountFile(
			{
				schema: "@tsuuanmi/internet-account",
				version: 1,
				provider: "chatgpt-web",
				status: "ready",
				verifiedAt: "2026-01-02T03:04:05.000Z",
				storageState: storageState(),
			},
			"chatgpt-web",
		);
		expect(account.revision).toBe(0);
	});

	it("commits only a snapshot based on the current account revision", () => {
		const store = new AccountStore(temporaryRoot());
		store.writeReady("gemini-web", storageState([{ name: "initial" }]));
		const initial = store.inspect("gemini-web").account!;
		const committed = store.writeReadyIfRevision("gemini-web", initial.revision, storageState([{ name: "first" }]));
		const stale = store.writeReadyIfRevision("gemini-web", initial.revision, storageState([{ name: "stale" }]));

		expect(committed?.revision).toBe(initial.revision + 1);
		expect(stale).toBeUndefined();
		expect(store.inspect("gemini-web").account?.storageState.origins[0]?.indexedDB).toEqual([{ name: "first" }]);
	});

	it("rejects unsupported schemas, provider mismatches, and malformed storage state", () => {
		const valid = {
			schema: "@tsuuanmi/internet-account",
			version: 1,
			provider: "chatgpt-web",
			status: "ready",
			verifiedAt: "2026-01-02T03:04:05.000Z",
			storageState: storageState(),
		};
		expect(() => parseAccountFile({ ...valid, version: 2 }, "chatgpt-web")).toThrow(/schema/);
		expect(() => parseAccountFile(valid, "gemini-web")).toThrow(/belongs/);
		expect(() => parseAccountFile({ ...valid, storageState: { cookies: {}, origins: [] } }, "chatgpt-web")).toThrow(
			/storage state/,
		);
	});

	it("rejects a reauth diagnostic with extra keys", () => {
		const root = temporaryRoot();
		const store = new AccountStore(root);
		store.writeReady("chatgpt-web", storageState());
		const account = store.inspect("chatgpt-web").account!;
		const path = providerLocations(root, "chatgpt-web").accountPath;
		const withExtra = {
			...account,
			status: "reauth-required",
			invalidatedAt: "2026-03-01T00:00:00.000Z",
			reauthDiagnostic: {
				observedAt: "2026-03-01T00:00:00.000Z",
				evidence: "login-url",
				secret: "leaked",
			},
		};
		writeFileSync(path, `${JSON.stringify(withExtra)}\n`, { mode: 0o600 });
		expect(store.inspect("chatgpt-web").state).toBe("invalid");
	});

	it("preserves the previous account when serialization fails", () => {
		const root = temporaryRoot();
		const store = new AccountStore(root);
		store.writeReady("chatgpt-web", storageState(), new Date("2026-01-01T00:00:00.000Z"));
		const path = providerLocations(root, "chatgpt-web").accountPath;
		const before = readFileSync(path, "utf8");
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const invalid = storageState([circular]);

		expect(() => store.writeReady("chatgpt-web", invalid)).toThrow();
		expect(readFileSync(path, "utf8")).toBe(before);
	});
});

describe("browser state capture", () => {
	it("requests IndexedDB from a portable Patchright context", async () => {
		const expected = storageState([{ name: "database" }]);
		const context = {
			storageState: async (options: unknown) => {
				expect(options).toEqual({ indexedDB: true });
				return expected;
			},
		};
		await expect(capturePortableStorageState(context as never)).resolves.toEqual(expected);
	});

	it("captures bootstrap cookies and local storage from a persistent profile", async () => {
		const cookies = storageState().cookies;
		const page = {
			isClosed: () => false,
			url: () => "https://example.com/app",
			evaluate: async () => [{ name: "account", value: "one" }],
		};
		const context = {
			cookies: async () => cookies,
			pages: () => [page],
		};

		await expect(captureProfileBootstrapState(context as never)).resolves.toEqual({
			cookies,
			origins: [{ origin: "https://example.com", localStorage: [{ name: "account", value: "one" }] }],
		});
	});
});
