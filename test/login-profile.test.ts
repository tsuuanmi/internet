import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import { discoverChrome } from "#internet/browser/chrome";
import { BrowserDisplayManager } from "#internet/browser/display";
import {
	loginProfileArgs,
	loginProfileIgnoredDefaultArgs,
	loginProfileReopenEnv,
} from "#internet/browser/login-profile";

it("changes display only while preserving native cookie encryption environment", () => {
	const native = {
		HOME: "/native",
		DISPLAY: ":1",
		XAUTHORITY: "/old",
		DBUS_SESSION_BUS_ADDRESS: "native-bus",
		XDG_CURRENT_DESKTOP: "GNOME",
	};
	expect(loginProfileReopenEnv(native, { HOME: "/different", DISPLAY: ":2" })).toEqual({
		...native,
		DISPLAY: ":2",
		XAUTHORITY: undefined,
	});
	expect(native.DISPLAY).toBe(":1");
});

// Opt-in: real native Chrome + Xvfb, synthetic loopback cookies only. Never
// touches a user profile, provider site, or real authentication material.
describe.runIf(process.env.INTERNET_TEST_LOGIN_PROFILE === "1")("native login profile persistence", () => {
	it("restores a session cookie that default clean profile reopen discards", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-session-cookie-"));
		const displayManager = new BrowserDisplayManager({ env: { ...process.env, DISPLAY: undefined } });
		let issued = false;
		let confirmed = false;
		const server = createServer((request, response) => {
			if (request.url === "/login" && !issued) {
				issued = true;
				response.setHeader("Set-Cookie", [
					"session=synthetic; Path=/; HttpOnly; SameSite=Lax",
					"persistent=synthetic; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax",
				]);
			}
			if (request.url === "/confirm")
				confirmed =
					request.headers.cookie?.includes("session=synthetic") === true &&
					request.headers.cookie.includes("persistent=synthetic");
			response.setHeader("Content-Type", "text/html");
			response.end("Synthetic login fixture<script>fetch('/confirm')</script>");
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/login`;
		try {
			const display = await displayManager.prepare(false);
			if (display.kind === "headless") throw new Error("Expected headed display");
			const executablePath = discoverChrome();
			for (const restore of [false, true]) {
				issued = false;
				confirmed = false;
				const profile = join(root, restore ? "restored" : "default");
				const args = restore
					? loginProfileArgs()
					: ["--no-first-run", "--no-default-browser-check", "--disable-background-mode"];
				const child = spawn(executablePath, [`--user-data-dir=${profile}`, ...args, url], {
					env: display.env,
					stdio: "ignore",
				});
				let spawnError: Error | undefined;
				child.on("error", (error) => {
					spawnError = error;
				});
				try {
					await vi.waitFor(
						() => {
							if (spawnError !== undefined) throw spawnError;
							expect(confirmed).toBe(true);
						},
						{ timeout: 20_000 },
					);
					// Native Chrome batches disk cookie writes; isolate session-restore
					// semantics from the separate rapid-Save/SIGTERM flush limitation.
					await new Promise((resolve) => setTimeout(resolve, 35_000));
				} finally {
					if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
						child.kill("SIGTERM");
						try {
							await vi.waitFor(() => expect(child.exitCode !== null || child.signalCode !== null).toBe(true), {
								timeout: 10_000,
							});
						} finally {
							if (child.exitCode === null && child.signalCode === null) {
								child.kill("SIGKILL");
								await vi.waitFor(() => expect(child.signalCode).not.toBeNull(), { timeout: 2_000 });
							}
						}
					}
				}
				const context = await chromium.launchPersistentContext(profile, {
					executablePath,
					headless: false,
					env: display.env,
					ignoreDefaultArgs: loginProfileIgnoredDefaultArgs(),
					args,
				});
				try {
					// Match captureLoginState's navigation before assessing cookies.
					// issued stays true, so this cannot issue replacement cookies.
					await context.pages()[0]!.goto(url, { waitUntil: "domcontentloaded" });
					const cookies = await context.cookies();
					expect(cookies.some((cookie) => cookie.name === "persistent")).toBe(true);
					expect(cookies.some((cookie) => cookie.name === "session")).toBe(restore);
				} finally {
					await context.close();
				}
			}
		} finally {
			await displayManager.dispose();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			rmSync(root, { recursive: true, force: true });
		}
	}, 120_000);
});
