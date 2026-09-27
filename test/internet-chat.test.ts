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

describe("internet_chat DSH adapter", () => {
	it("maps DSH session and call identity into the host-neutral application context", async () => {
		const execute = vi.fn(async () => ({
			answer: "Answer",
			artifactId: "a".repeat(64),
			totalChars: 6,
			truncated: false,
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			conversationId: "native",
		}));
		const tool = defineInternetChatTool({ execute } as never, 1_000);
		const signal = new AbortController().signal;

		await expect(
			tool.execute({ account: "chatgpt-thinker", prompt: "inspect", visible: true }, {
				agent: { id: "teammate-session" },
				callId: "call-42",
				signal,
			} as never),
		).resolves.toMatchObject({
			answer: "Answer",
			artifactId: "a".repeat(64),
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
		});
		expect(execute).toHaveBeenCalledWith(
			{
				ownerSessionId: "teammate-session",
				requestId: "call-42",
				signal,
			},
			{
				accountId: "chatgpt-thinker",
				prompt: "inspect",
				visible: true,
			},
		);
	});

	it("keeps host request identities separate while preserving the owner session", async () => {
		const execute = vi.fn(async () => ({
			answer: "Answer",
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
		}));
		const tool = defineInternetChatTool({ execute } as never, 1_000);

		await tool.execute({ account: "chatgpt-thinker", prompt: "alpha" }, {
			agent: { id: "researcher-a" },
			callId: "call-a",
			signal: new AbortController().signal,
		} as never);
		await tool.execute({ account: "chatgpt-thinker", prompt: "beta" }, {
			agent: { id: "researcher-b" },
			callId: "call-b",
			signal: new AbortController().signal,
		} as never);

		expect(execute.mock.calls.map(([context]) => [context.ownerSessionId, context.requestId])).toEqual([
			["researcher-a", "call-a"],
			["researcher-b", "call-b"],
		]);
	});

	it("fails closed without an agent-backed DSH session", async () => {
		const execute = vi.fn();
		const tool = defineInternetChatTool({ execute } as never, 1_000);

		await expect(
			tool.execute({ account: "chatgpt-thinker", prompt: "hello" }, {
				callId: "call-1",
				signal: new AbortController().signal,
			} as never),
		).resolves.toMatchObject({
			isError: true,
			answer: expect.stringContaining("agent-backed DSH session"),
		});
		expect(execute).not.toHaveBeenCalled();
	});
});
