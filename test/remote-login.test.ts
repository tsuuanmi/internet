import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
