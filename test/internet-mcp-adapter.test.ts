import { describe, expect, it, vi } from "vitest";
import { createInternetMcpToolDefinitions, type InternetMcpToolRequestContext } from "#internet/mcp/server";

describe("Internet MCP adapter", () => {
	it("maps MCP chat calls into the host-neutral application context", async () => {
		const execute = vi.fn(async () => ({
			answer: "portable answer",
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			artifactId: "a".repeat(64),
			totalChars: 15,
			truncated: false,
		}));
		const tools = createInternetMcpToolDefinitions({
			ownerSessionId: "codex-local-agent",
			chat: { execute } as never,
			artifacts: { read: vi.fn() } as never,
		});
		const chat = tools.find((tool) => tool.name === "internet_chat");
		expect(chat).toBeDefined();
		const signal = new AbortController().signal;
		const request: InternetMcpToolRequestContext = { requestId: 42, signal };

		await expect(
			chat?.invoke(
				{ account: "chatgpt-thinker", prompt: "Inspect", visible: true },
				request,
			),
		).resolves.toMatchObject({
			structuredContent: {
				answer: "portable answer",
				accountId: "chatgpt-thinker",
				artifactId: "a".repeat(64),
			},
			content: [{ type: "text", text: "portable answer" }],
		});
		expect(execute).toHaveBeenCalledWith(
			{ ownerSessionId: "codex-local-agent", requestId: "42", signal },
			{ accountId: "chatgpt-thinker", prompt: "Inspect", visible: true },
		);
	});

	it("maps MCP artifact reads without exposing transport identity as ownership", async () => {
		const read = vi.fn(() => ({
			text: "evidence",
			artifactId: "b".repeat(64),
			offset: 4,
			totalChars: 20,
			nextOffset: 12,
		}));
		const tools = createInternetMcpToolDefinitions({
			ownerSessionId: "claude-local-agent",
			chat: { execute: vi.fn() } as never,
			artifacts: { read } as never,
		});
		const artifact = tools.find((tool) => tool.name === "internet_artifact");

		await expect(
			artifact?.invoke(
				{ artifact_id: "b".repeat(64), offset: 4, max_chars: 8 },
				{ requestId: "req-artifact" },
			),
		).resolves.toEqual({
			content: [{ type: "text", text: "evidence" }],
			structuredContent: {
				text: "evidence",
				artifactId: "b".repeat(64),
				offset: 4,
				totalChars: 20,
				nextOffset: 12,
			},
		});
		expect(read).toHaveBeenCalledWith(
			{ ownerSessionId: "claude-local-agent", requestId: "req-artifact" },
			{ artifactId: "b".repeat(64), offset: 4, maxChars: 8 },
		);
	});

	it("returns application failures as MCP tool errors instead of throwing provider diagnostics through the transport", async () => {
		const execute = vi.fn(async () => ({
			answer: "internet_chat failed (timeout): provider stalled",
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			isError: true,
		}));
		const tools = createInternetMcpToolDefinitions({
			ownerSessionId: "owner",
			chat: { execute } as never,
			artifacts: { read: vi.fn() } as never,
		});
		const chat = tools.find((tool) => tool.name === "internet_chat");

		await expect(
			chat?.invoke(
				{ account: "chatgpt-thinker", prompt: "Inspect" },
				{ requestId: "req-error" },
			),
		).resolves.toMatchObject({
			isError: true,
			content: [{ type: "text", text: expect.stringContaining("timeout") }],
		});
	});

	it("requires explicit semantic owner identity at server composition", () => {
		expect(() =>
			createInternetMcpToolDefinitions({
				ownerSessionId: " ",
				chat: { execute: vi.fn() } as never,
				artifacts: { read: vi.fn() } as never,
			}),
		).toThrow("owner session id");
	});
});
