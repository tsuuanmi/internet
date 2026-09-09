import { describe, expect, it, vi } from "vitest";
import type { AccountStatus } from "#internet/browser/runtime";
import { defineInternetBrowserTool } from "#internet/tools/internet-browser";

const allowed = new Set(["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"] as const);

function manager(status: AccountStatus) {
	return {
		login: vi.fn(async (accountId) => ({ ...status, accountId }) as AccountStatus),
		status: vi.fn(async (accountId) => ({ ...status, accountId }) as AccountStatus),
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
			action: "login",
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
		expect((result as { message: string }).message).toContain("Save account");
		expect((result as { message: string }).message).toContain("Do not close Chrome manually");
	});

	it("starts login for all enabled accounts without sharing lifecycle identity", async () => {
		const browser = manager({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/account.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);
		await expect(tool.execute({ action: "login_all" }, {} as never)).resolves.toMatchObject({
			ok: true,
			action: "login_all",
			accounts: expect.stringContaining("chatgpt-writer=ready"),
		});
		expect(browser.login).toHaveBeenCalledTimes(3);
		expect(browser.login).toHaveBeenCalledWith("chatgpt-thinker", { remote: false });
		expect(browser.login).toHaveBeenCalledWith("chatgpt-writer", { remote: false });
		expect(browser.login).toHaveBeenCalledWith("gemini-thinker", { remote: false });
	});

	it("returns an account-to-port manifest for login_all remote sessions even when persisted state is ready", async () => {
		const ports = {
			"chatgpt-thinker": 39000,
			"chatgpt-writer": 39001,
			"gemini-thinker": 39002,
		} as const;
		const browser = {
			login: vi.fn(async (accountId: keyof typeof ports) => {
				const port = ports[accountId];
				return {
					accountId,
					provider: accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
					state: accountId === "chatgpt-writer" ? ("ready" as const) : ("missing" as const),
					accountPath: `/accounts/${accountId}.json`,
					remoteLogin: {
						state: "waiting" as const,
						message: "Remote desktop ready.",
						port,
						sshCommand: `ssh -N -L ${port}:127.0.0.1:${port} <user>@<server>`,
						url: `http://127.0.0.1:${port}/token-${accountId}/`,
						expiresAt: "2026-01-01T00:03:00.000Z",
					},
				} satisfies AccountStatus;
			}),
			status: vi.fn(),
			stop: vi.fn(),
		};
		const tool = defineInternetBrowserTool(browser as never, allowed);
		const result = await tool.execute({ action: "login_all", remote: true }, {} as never);
		const output = result as { accounts: string; remoteLogins: string; message: string };

		expect(output.accounts).toContain("chatgpt-thinker=remote-waiting(port=39000)");
		expect(output.accounts).toContain("chatgpt-writer=remote-waiting(port=39001)");
		expect(output.accounts).toContain("gemini-thinker=remote-waiting(port=39002)");
		expect(output.remoteLogins).toContain("chatgpt-thinker: remote=waiting port=39000");
		expect(output.remoteLogins).toContain("URL: http://127.0.0.1:39001/token-chatgpt-writer/");
		expect(output.remoteLogins).toContain("gemini-thinker: remote=waiting port=39002");
		expect(output.message).toContain("Save account");
		expect(output.message).toContain("Do not close Chrome manually");
	});

	it("reports all account states in one status call", async () => {
		const browser = manager({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			state: "ready",
			accountPath: "/account.json",
		});
		const tool = defineInternetBrowserTool(browser as never, allowed);
		await expect(tool.execute({ action: "status_all" }, {} as never)).resolves.toMatchObject({
			ok: true,
			action: "status_all",
			accounts: expect.stringContaining("gemini-thinker=ready"),
		});
		expect(browser.status).toHaveBeenCalledTimes(3);
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
