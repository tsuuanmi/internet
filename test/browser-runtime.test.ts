import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserManager, type ProviderStatus } from "#internet/browser/runtime";
import { ensureProviderDirectories, providerLocations } from "#internet/browser/storage";
import { resolveBrowserConfig, type WebProvider } from "#internet/core/config";

const temporaryRoots: string[] = [];

function manager(): BrowserManager {
	const dataDir = mkdtempSync(join(tmpdir(), "internet-runtime-"));
	temporaryRoots.push(dataDir);
	return new BrowserManager(resolveBrowserConfig({ dataDir }));
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("BrowserManager provider serialization", () => {
	it("runs only one operation per provider at a time", async () => {
		const browser = manager();
		const releases: Array<() => void> = [];
		let active = 0;
		let maximumActive = 0;
		const loginProvider = vi.fn(async (provider: "chatgpt-web"): Promise<ProviderStatus> => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return { provider, loggedIn: true, storageStatePath: "/state" };
		});
		(browser as any).loginProvider = loginProvider;

		const first = browser.login("chatgpt-web");
		const second = browser.login("chatgpt-web");
		await vi.waitFor(() => expect(loginProvider).toHaveBeenCalledTimes(1));
		releases.shift()?.();
		await vi.waitFor(() => expect(loginProvider).toHaveBeenCalledTimes(2));
		expect(maximumActive).toBe(1);
		releases.shift()?.();
		await Promise.all([first, second]);
		await browser.dispose();
	});
});

describe("BrowserManager visible login profiles", () => {
	it.each(["chatgpt-web", "gemini-web"] as const)("retains the %s profile across login actions", async (provider) => {
		const dataDir = mkdtempSync(join(tmpdir(), "internet-login-profile-"));
		temporaryRoots.push(dataDir);
		ensureProviderDirectories(dataDir, provider);
		const locations = providerLocations(dataDir, provider);
		const sentinelPath = join(locations.profileDir, "signed-in-profile-sentinel");
		writeFileSync(sentinelPath, provider);

		const browser = new BrowserManager(resolveBrowserConfig({ dataDir }));
		(browser as any).display.requireInteractiveDisplay = vi.fn();
		(browser as any).launchNormalLogin = vi.fn(async (actualProvider: WebProvider) => {
			expect(actualProvider).toBe(provider);
			expect(existsSync(sentinelPath)).toBe(true);
		});
		(browser as any).captureLoginState = vi.fn(async () => {
			expect(existsSync(sentinelPath)).toBe(true);
			return { cookies: [], origins: [] };
		});
		(browser as any).verifyStorageState = vi.fn(async () => {});

		await browser.login(provider);
		await browser.login(provider);

		expect(existsSync(sentinelPath)).toBe(true);
		expect((browser as any).launchNormalLogin).toHaveBeenCalledTimes(2);
		expect((browser as any).launchNormalLogin).toHaveBeenCalledWith(provider);
		await browser.dispose();
	});
});
