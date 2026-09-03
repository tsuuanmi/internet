import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteLoginSession } from "#internet/browser/remote-login";

const roots: string[] = [];
const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
const [glibcMajor, glibcMinor] = (report?.header?.glibcVersionRuntime ?? "").split(".").map(Number);
const supported =
	process.platform === "linux" && process.arch === "x64" && (glibcMajor > 2 || (glibcMajor === 2 && glibcMinor >= 35));

function fixture(): { dataDir: string; chromePath: string; profileDir: string } {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-remote-login-"));
	roots.push(dataDir);
	const chromePath = join(dataDir, "fake-chrome.sh");
	writeFileSync(chromePath, "#!/bin/sh\ntrap 'exit 0' TERM INT\nwhile :; do sleep 1; done\n");
	chmodSync(chromePath, 0o700);
	const profileDir = join(dataDir, "profile");
	mkdirSync(profileDir, { mode: 0o700 });
	return { dataDir, chromePath, profileDir };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.runIf(supported)("RemoteLoginSession", () => {
	it("serves a tokenized loopback page and finalizes once", async () => {
		const files = fixture();
		let finishFinalization = (): void => {};
		const finalization = new Promise<void>((resolve) => {
			finishFinalization = resolve;
		});
		const finalize = vi.fn(async () => finalization);
		const closed = vi.fn();
		const session = await RemoteLoginSession.start({
			provider: "chatgpt-web",
			...files,
			homeUrl: "https://chatgpt.com/",
			timeoutMs: 10_000,
			finalize,
			onClosed: closed,
			clientScript: "export {};",
		});
		try {
			const status = session.status();
			expect(status).toMatchObject({ state: "waiting", port: expect.any(Number), expiresAt: expect.any(String) });
			expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{43}\/$/);
			expect(status.sshCommand).toContain(`127.0.0.1:${status.port}`);
			const url = new URL(status.url!);
			const page = await fetch(url);
			expect(page.status).toBe(200);
			expect(page.headers.get("cache-control")).toBe("no-store");
			expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
			expect(await page.text()).toContain("Save account");

			const badOrigin = await fetch(new URL("status", url), { headers: { Origin: "http://evil.example" } });
			expect(badOrigin.status).toBe(403);
			const forwarded = await fetch(new URL("status", url), { headers: { "X-Forwarded-For": "127.0.0.1" } });
			expect(forwarded.status).toBe(403);
			const noOriginSave = await fetch(new URL("save", url), { method: "POST" });
			expect(noOriginSave.status).toBe(403);
			const save = await fetch(new URL("save", url), { method: "POST", headers: { Origin: url.origin } });
			expect(save.status).toBe(202);
			await vi.waitFor(() => expect(session.status().state).toBe("finalizing"), { timeout: 10_000 });
			const cancel = await fetch(new URL("cancel", url), { method: "POST", headers: { Origin: url.origin } });
			expect(cancel.status).toBe(409);
			finishFinalization();
			await vi.waitFor(() => expect(session.status().state).toBe("complete"), { timeout: 10_000 });
			expect(finalize).toHaveBeenCalledTimes(1);
			await session.requestSave();
			expect(finalize).toHaveBeenCalledTimes(1);
		} finally {
			await session.dispose();
		}
		expect(closed).toHaveBeenCalledTimes(1);
		expect(readdirSync(join(files.dataDir, "remote-login"))).toEqual([]);
	}, 20_000);

	it("serves the generated remote-login client by default", async () => {
		const files = fixture();
		const { RemoteLoginSession: BuiltRemoteLoginSession } = await import(
			new URL("../dist/browser/remote-login.js", import.meta.url).href
		);
		const session = await BuiltRemoteLoginSession.start({
			provider: "chatgpt-web",
			...files,
			homeUrl: "https://chatgpt.com/",
			timeoutMs: 10_000,
			finalize: async () => {},
		});
		try {
			const url = new URL(session.status().url!);
			const response = await fetch(new URL("client.js", url));
			expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
			expect(await response.text()).toBe(
				await readFile(new URL("../dist/remote-login-client.js", import.meta.url), "utf8"),
			);
		} finally {
			await session.dispose();
		}
	});

	it("returns tunnel instructions before it launches Chrome", async () => {
		const files = fixture();
		const marker = join(files.dataDir, "chrome-started");
		writeFileSync(
			files.chromePath,
			`#!/bin/sh\ntouch ${marker}\ntrap 'exit 0' TERM INT\nwhile :; do sleep 1; done\n`,
		);
		const session = await RemoteLoginSession.start({
			provider: "chatgpt-web",
			...files,
			homeUrl: "https://chatgpt.com/",
			timeoutMs: 10_000,
			finalize: async () => {},
			clientScript: "export {};",
		});
		try {
			const status = session.status();
			expect(status).toMatchObject({ state: "waiting", port: expect.any(Number), url: expect.any(String) });
			expect(existsSync(marker)).toBe(false);
			await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000 });
		} finally {
			await session.dispose();
		}
	}, 20_000);

	it("reports missing VNC candidates without crashing the host", async () => {
		const files = fixture();
		await expect(
			RemoteLoginSession.start({
				provider: "chatgpt-web",
				...files,
				homeUrl: "https://chatgpt.com/",
				timeoutMs: 1_000,
				finalize: async () => {},
				clientScript: "export {};",
				vncCandidates: [
					{ executable: "/missing/bundled-x11vnc", source: "bundled", env: {} },
					{ executable: "/missing/system-x11vnc", source: "system", env: {} },
				],
			}),
		).rejects.toThrow(/Could not start loopback x11vnc/);
		expect(readdirSync(join(files.dataDir, "remote-login"))).toEqual([]);
	}, 10_000);

	it("contains an immediately rejected account finalizer", async () => {
		const files = fixture();
		const session = await RemoteLoginSession.start({
			provider: "gemini-web",
			...files,
			homeUrl: "https://gemini.google.com/",
			timeoutMs: 5_000,
			finalize: async () => {
				throw new Error("portable capture failed");
			},
			clientScript: "export {};",
		});
		await session.requestSave();
		expect(session.status()).toMatchObject({ state: "failed", message: "portable capture failed" });
		await session.dispose();
		expect(readdirSync(join(files.dataDir, "remote-login"))).toEqual([]);
	}, 15_000);

	it("expires and cleans a login that was not saved", async () => {
		const files = fixture();
		const finalize = vi.fn(async () => {});
		const session = await RemoteLoginSession.start({
			provider: "gemini-web",
			...files,
			homeUrl: "https://gemini.google.com/",
			timeoutMs: 100,
			finalize,
			clientScript: "export {};",
		});
		await vi.waitFor(() => expect(session.status().state).toBe("failed"), { timeout: 5_000 });
		expect(session.status().message).toMatch(/timed out/);
		expect(finalize).not.toHaveBeenCalled();
		await session.dispose();
		expect(readdirSync(join(files.dataDir, "remote-login"))).toEqual([]);
	}, 15_000);
});
