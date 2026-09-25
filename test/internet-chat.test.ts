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

describe("internet_chat website participant boundary", () => {
	const allowed = new Set(["chatgpt-thinker"] as const);

	it("uses the owning DSH session and tool call id as durable website identities", async () => {
		const execute = vi.fn(async () => ({
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "chat" as const,
			text: "Answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
			artifactId: "a".repeat(64),
			totalChars: 6,
		}));
		const tool = defineInternetChatTool({ execute } as never, 1_000, allowed);
		const signal = new AbortController().signal;

		await expect(
			tool.execute(
				{ account: "chatgpt-thinker", prompt: "inspect", visible: true },
				{ agent: { id: "teammate-session" }, callId: "call-42", signal } as never,
			),
		).resolves.toMatchObject({
			answer: "Answer",
			artifactId: "a".repeat(64),
			totalChars: 6,
			truncated: false,
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			conversationId: "native",
		});
		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "teammate-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "call-42",
			mode: "chat",
			prompt: "inspect",
			visible: true,
			signal,
		});
	});

	it("keeps teammate request identities separate without changing their conversation owner", async () => {
		const execute = vi.fn(async (request: { ownerSessionId: string; logicalRequestId: string }) => ({
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "chat" as const,
			text: "Answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
			artifactId: "b".repeat(64),
			totalChars: 6,
			ownerSessionId: request.ownerSessionId,
		}));
		const tool = defineInternetChatTool({ execute } as never, 1_000, allowed);

		await tool.execute(
			{ account: "chatgpt-thinker", prompt: "alpha" },
			{ agent: { id: "researcher-a" }, callId: "call-a", signal: new AbortController().signal } as never,
		);
		await tool.execute(
			{ account: "chatgpt-thinker", prompt: "beta" },
			{ agent: { id: "researcher-b" }, callId: "call-b", signal: new AbortController().signal } as never,
		);

		expect(execute.mock.calls.map(([request]) => [request.ownerSessionId, request.logicalRequestId])).toEqual([
			["researcher-a", "call-a"],
			["researcher-b", "call-b"],
		]);
	});

	it("fails closed without an agent-backed DSH session", async () => {
		const execute = vi.fn();
		const tool = defineInternetChatTool({ execute } as never, 1_000, allowed);

		await expect(
			tool.execute(
				{ account: "chatgpt-thinker", prompt: "hello" },
				{ callId: "call-1", signal: new AbortController().signal } as never,
			),
		).resolves.toMatchObject({
			isError: true,
			answer: expect.stringContaining("agent-backed DSH session"),
		});
		expect(execute).not.toHaveBeenCalled();
	});
});
