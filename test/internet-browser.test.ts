import { describe, expect, it, vi } from "vitest";
import type { ProviderStatus } from "#internet/browser/runtime";
import { defineInternetBrowserTool } from "#internet/tools/browser";

const allowed = new Set(["chatgpt-web", "gemini-web"] as const);

function manager(status: ProviderStatus) {
	return {
		login: vi.fn(async () => status),
		status: vi.fn(async () => status),
		stop: vi.fn(async () => {}),
	};
}

describe("internet_browser", () => {
	it("reports a verified portable account after login", async () => {
		const browser = manager({
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/home/user/.dsh/internet/accounts/chatgpt-web.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);

		await expect(tool.execute({ action: "login", model: "chatgpt-web" }, {} as never)).resolves.toEqual({
			ok: true,
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/home/user/.dsh/internet/accounts/chatgpt-web.json",
			message: "chatgpt-web portable account is verified and ready.",
		});
	});

	it.each([
		["missing", "gemini-web has no account; run internet_browser login."],
		["reauth-required", "gemini-web requires sign-in; run internet_browser login."],
		["invalid", "gemini-web account file is invalid; run internet_browser login to replace it."],
	] as const)("reports %s local account state precisely", async (state, message) => {
		const browser = manager({
			provider: "gemini-web",
			state,
			accountPath: "/home/user/.dsh/internet/accounts/gemini-web.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);

		await expect(tool.execute({ action: "status", model: "gemini-web" }, {} as never)).resolves.toEqual({
			ok: true,
			provider: "gemini-web",
			state,
			accountPath: "/home/user/.dsh/internet/accounts/gemini-web.json",
			message,
		});
	});
});
