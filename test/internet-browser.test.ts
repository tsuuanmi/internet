import { describe, expect, it, vi } from "vitest";
import type { AccountStatus } from "#internet/browser/runtime";
import { defineInternetBrowserTool } from "#internet/tools/internet-browser";

const allowed = new Set(["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"] as const);

function manager(status: AccountStatus) {
	return {
		login: vi.fn(async () => status),
		status: vi.fn(async () => status),
		stop: vi.fn(async () => {}),
	};
}

describe("internet_browser", () => {
	it("reports a verified portable account after explicit thinker login", async () => {
		const browser = manager({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/home/user/.dsh/internet/accounts/chatgpt-thinker.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);

		await expect(tool.execute({ action: "login", account: "chatgpt-thinker" }, {} as never)).resolves.toEqual({
			ok: true,
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/home/user/.dsh/internet/accounts/chatgpt-thinker.json",
			message: "chatgpt-thinker portable account is verified and ready.",
		});
		expect(browser.login).toHaveBeenCalledWith("chatgpt-thinker", { remote: false });
	});

	it("routes the ChatGPT writer independently from the thinker", async () => {
		const browser = manager({
			accountId: "chatgpt-writer",
			provider: "chatgpt-web",
			state: "missing",
			accountPath: "/accounts/chatgpt-writer.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);
		await tool.execute({ action: "status", account: "chatgpt-writer" }, {} as never);
		expect(browser.status).toHaveBeenCalledWith("chatgpt-writer");
	});

	it("returns account-specific SSH-forwarded remote-login instructions", async () => {
		const remoteLogin = {
			state: "waiting" as const,
			message: "Remote desktop ready.",
			url: "http://127.0.0.1:43123/token/",
			port: 43123,
			sshCommand: "ssh -N -L 43123:127.0.0.1:43123 <user>@<server>",
			expiresAt: "2026-01-01T00:03:00.000Z",
		};
		const browser = manager({
			accountId: "chatgpt-writer",
			provider: "chatgpt-web",
			state: "missing",
			accountPath: "/account.json",
			remoteLogin,
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);
		const result = await tool.execute({ action: "login", account: "chatgpt-writer", remote: true }, {} as never);
		expect(browser.login).toHaveBeenCalledWith("chatgpt-writer", { remote: true });
		expect(result).toMatchObject({ ok: true, accountId: "chatgpt-writer", provider: "chatgpt-web", remoteLogin });
		expect((result as { message: string }).message).toContain("chatgpt-writer");
	});

	it("rejects disabled and provider-like identities rather than falling back", async () => {
		const browser = manager({
			accountId: "gemini-thinker",
			provider: "gemini-web",
			state: "missing",
			accountPath: "/account.json",
		});
		const tool = defineInternetBrowserTool(browser as never, new Set(["gemini-thinker"] as const));
		await expect(tool.execute({ action: "status", account: "chatgpt-writer" }, {} as never)).resolves.toMatchObject({
			ok: false,
			accountId: "chatgpt-writer",
		});
		await expect(tool.execute({ action: "status", account: "chatgpt-web" }, {} as never)).rejects.toMatchObject({
			code: "INVALID_ARGS",
		});
		expect(browser.status).not.toHaveBeenCalledWith("chatgpt-web");
	});
});
