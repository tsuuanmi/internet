import { describe, expect, it, vi } from "vitest";
import { parseChatArgs } from "#internet/tools/args";
import { defineInternetChatTool } from "#internet/tools/internet-chat";

describe("parseChatArgs", () => {
	it("accepts an explicit account, prompt, and visibility", () => {
		expect(parseChatArgs({ account: "chatgpt-thinker", prompt: "Hello" })).toEqual({
			accountId: "chatgpt-thinker",
			prompt: "Hello",
		});
		expect(parseChatArgs({ account: "gemini-thinker", prompt: "Hi", visible: true })).toEqual({
			accountId: "gemini-thinker",
			prompt: "Hi",
			visible: true,
		});
	});

	it("rejects provider names and unknown accounts", () => {
		expect(() => parseChatArgs({ account: "chatgpt-web", prompt: "Hello" })).toThrow(/account must be one of/);
		expect(() => parseChatArgs({ account: "claude", prompt: "Hello" })).toThrow(/account must be one of/);
	});

	it("rejects a blank prompt", () => {
		expect(() => parseChatArgs({ account: "chatgpt-thinker", prompt: "   " })).toThrow(/non-empty/);
	});

	it("rejects invalid visibility", () => {
		expect(() => parseChatArgs({ account: "chatgpt-thinker", prompt: "Hello", visible: "yes" })).toThrow(/boolean/);
	});
});

describe("internet_chat DSH session continuity", () => {
	const allowed = new Set(["chatgpt-thinker"] as const);

	it("uses the owning DSH agent id as the stable website session identity across turns", async () => {
		const chat = vi
			.fn()
			.mockResolvedValueOnce({
				text: "First",
				url: "https://chatgpt.com/c/native",
				conversationId: "native",
			})
			.mockResolvedValueOnce({
				text: "Second",
				url: "https://chatgpt.com/c/native",
				conversationId: "native",
			});
		const tool = defineInternetChatTool({ chat } as never, 1_000, allowed);
		const signal = new AbortController().signal;
		const exec = { agent: { id: "teammate-session" }, signal } as never;

		await tool.execute({ account: "chatgpt-thinker", prompt: "first" }, exec);
		await tool.execute({ account: "chatgpt-thinker", prompt: "second" }, exec);

		expect(chat).toHaveBeenNthCalledWith(1, "chatgpt-thinker", {
			prompt: "first",
			sessionId: "teammate-session",
			visible: undefined,
			signal,
		});
		expect(chat).toHaveBeenNthCalledWith(2, "chatgpt-thinker", {
			prompt: "second",
			sessionId: "teammate-session",
			visible: undefined,
			signal,
		});
	});

	it("keeps different DSH teammates in different website sessions", async () => {
		const chat = vi.fn(async () => ({
			text: "Answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
		}));
		const tool = defineInternetChatTool({ chat } as never, 1_000, allowed);

		await tool.execute({ account: "chatgpt-thinker", prompt: "alpha" }, {
			agent: { id: "researcher-a" },
			signal: new AbortController().signal,
		} as never);
		await tool.execute({ account: "chatgpt-thinker", prompt: "beta" }, {
			agent: { id: "researcher-b" },
			signal: new AbortController().signal,
		} as never);

		expect(chat.mock.calls.map(([, request]) => request.sessionId)).toEqual(["researcher-a", "researcher-b"]);
	});

	it("fails closed without an agent-backed DSH session", async () => {
		const chat = vi.fn();
		const tool = defineInternetChatTool({ chat } as never, 1_000, allowed);

		await expect(tool.execute({ account: "chatgpt-thinker", prompt: "hello" }, {} as never)).resolves.toMatchObject({
			isError: true,
			answer: expect.stringContaining("agent-backed DSH session"),
		});
		expect(chat).not.toHaveBeenCalled();
	});
});
