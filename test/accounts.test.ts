import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore, type PortableStorageState, parseAccountFile } from "#internet/browser/accounts";
import { accountLocations } from "#internet/browser/storage";

const roots: string[] = [];

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "internet-accounts-"));
	roots.push(value);
	return value;
}

function state(label = "one"): PortableStorageState {
	return {
		cookies: [
			{
				name: "session",
				value: label,
				domain: ".example.com",
				path: "/",
				expires: -1,
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
			},
		],
		origins: [{ origin: "https://example.com", localStorage: [{ name: "account", value: label }] }],
	};
}

afterEach(() => {
	for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("AccountStore account identity", () => {
	it.each([
		["chatgpt-thinker", "chatgpt-web"],
		["chatgpt-writer", "chatgpt-web"],
		["gemini-thinker", "gemini-web"],
	] as const)("persists private v2 state for %s", (accountId, provider) => {
		const store = new AccountStore(root());
		store.writeReady(accountId, state(), new Date("2026-01-02T03:04:05.000Z"));
		const inspection = store.inspect(accountId);
		expect(inspection).toMatchObject({
			state: "ready",
			account: {
				version: 2,
				accountId,
				provider,
				status: "ready",
				revision: 1,
			},
		});
		if (process.platform !== "win32") {
			expect(statSync(dirname(inspection.path)).mode & 0o777).toBe(0o700);
			expect(statSync(inspection.path).mode & 0o777).toBe(0o600);
		}
	});

	it("isolates thinker and writer state even though both use ChatGPT", () => {
		const store = new AccountStore(root());
		store.writeReady("chatgpt-thinker", state("thinker"));
		store.writeReady("chatgpt-writer", state("writer"));
		expect(store.inspect("chatgpt-thinker").path).not.toBe(store.inspect("chatgpt-writer").path);
		expect(store.inspect("chatgpt-thinker").account?.storageState.cookies[0]?.value).toBe("thinker");
		expect(store.inspect("chatgpt-writer").account?.storageState.cookies[0]?.value).toBe("writer");
	});

	it("keeps stale-write protection account-local", () => {
		const store = new AccountStore(root());
		store.writeReady("chatgpt-thinker", state("initial"));
		const revision = store.inspect("chatgpt-thinker").account!.revision;
		expect(store.writeReadyIfRevision("chatgpt-thinker", revision, state("fresh"))?.revision).toBe(revision + 1);
		expect(store.writeReadyIfRevision("chatgpt-thinker", revision, state("stale"))).toBeUndefined();
		expect(store.inspect("chatgpt-thinker").account?.storageState.cookies[0]?.value).toBe("fresh");
	});

	it("marks only the selected account for reauthentication", () => {
		const store = new AccountStore(root());
		store.writeReady("chatgpt-thinker", state("thinker"));
		store.writeReady("chatgpt-writer", state("writer"));
		store.markReauthRequired("chatgpt-writer", new Date("2026-02-03T04:05:06.000Z"), {
			observedAt: "2026-02-03T04:05:06.000Z",
			evidence: "login-url",
		});
		expect(store.inspect("chatgpt-thinker").state).toBe("ready");
		expect(store.inspect("chatgpt-writer").state).toBe("reauth-required");
	});

	it("rejects old provider-keyed schema instead of migrating it", () => {
		expect(() =>
			parseAccountFile(
				{
					schema: "@tsuuanmi/internet-account",
					version: 1,
					provider: "chatgpt-web",
					status: "ready",
					verifiedAt: "2026-01-02T03:04:05.000Z",
					storageState: state(),
				},
				"chatgpt-thinker",
			),
		).toThrow(/schema/);
	});

	it("rejects account and provider mismatches", () => {
		const valid = {
			schema: "@tsuuanmi/internet-account",
			version: 2,
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			status: "ready",
			verifiedAt: "2026-01-02T03:04:05.000Z",
			revision: 1,
			storageState: state(),
		};
		expect(() => parseAccountFile({ ...valid, accountId: "chatgpt-writer" }, "chatgpt-thinker")).toThrow(/belongs/);
		expect(() => parseAccountFile({ ...valid, provider: "gemini-web" }, "chatgpt-thinker")).toThrow(/provider/);
	});

	it("reports malformed canonical files as invalid without touching other accounts", () => {
		const dataDir = root();
		const store = new AccountStore(dataDir);
		store.writeReady("chatgpt-writer", state("writer"));
		const thinkerPath = accountLocations(dataDir, "chatgpt-thinker").accountPath;
		writeFileSync(thinkerPath, "not json", { mode: 0o600 });
		expect(store.inspect("chatgpt-thinker").state).toBe("invalid");
		expect(store.inspect("chatgpt-writer").state).toBe("ready");
		expect(readFileSync(accountLocations(dataDir, "chatgpt-writer").accountPath, "utf8")).toContain("chatgpt-writer");
	});
});
