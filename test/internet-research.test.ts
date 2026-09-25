import { describe, expect, it, vi } from "vitest";
import { parseResearchArgs } from "#internet/tools/args";
import { defineInternetResearchTool } from "#internet/tools/internet-research";

describe("parseResearchArgs", () => {
	it("accepts explicit thinker accounts", () => {
		expect(
			parseResearchArgs({
				query: "Compare two policies",
				name: "policy",
				accounts: ["gemini-thinker"],
				visible: true,
			}),
		).toEqual({
			query: "Compare two policies",
			name: "policy",
			accounts: ["gemini-thinker"],
			visible: true,
		});
	});

	it("rejects blank queries, duplicate accounts, and provider names", () => {
		expect(() => parseResearchArgs({ query: " " })).toThrow(/non-empty/);
		expect(() => parseResearchArgs({ query: "x", accounts: ["gemini-thinker", "gemini-thinker"] })).toThrow(
			/duplicates/,
		);
		expect(() => parseResearchArgs({ query: "x", accounts: ["gemini-web"] })).toThrow(/must be one of/);
	});
});

describe("internet_research execution", () => {
	const allowed = new Set(["chatgpt-thinker", "gemini-thinker"] as const);
	const config = { researchTimeoutMs: 1 } as never;

	it("routes each account through the durable website participant with a named research owner", async () => {
		const execute = vi.fn(async (request: { accountId: "chatgpt-thinker" | "gemini-thinker" }) => ({
			accountId: request.accountId,
			provider: request.accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
			mode: "research" as const,
			text: "Report",
			url: "https://gemini.google.com/app/conversation",
			conversationId: "conversation",
			artifactId: "c".repeat(64),
			totalChars: 6,
		}));
		const tool = defineInternetResearchTool({ execute } as never, config, allowed);
		const signal = new AbortController().signal;

		await expect(
			tool.execute(
				{ query: "Compare policies", name: "policy", accounts: ["gemini-thinker"], visible: true },
				{ agent: { id: "agent" }, callId: "call-research", signal } as never,
			),
		).resolves.toEqual({
			state: "completed",
			results: [
				{
					accountId: "gemini-thinker",
					provider: "gemini-web",
					state: "completed",
					report: "Report",
					url: "https://gemini.google.com/app/conversation",
					conversationId: "conversation",
					artifactId: "c".repeat(64),
					totalChars: 6,
					truncated: false,
				},
			],
		});
		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "agent:research:policy",
			accountId: "gemini-thinker",
			logicalRequestId: "call-research",
			mode: "research",
			prompt: "Compare policies",
			visible: true,
			signal,
		});
	});

	it("uses account identity to keep parallel research receipts independent under one tool call", async () => {
		const execute = vi.fn(async (request: { accountId: "chatgpt-thinker" | "gemini-thinker" }) => ({
			accountId: request.accountId,
			provider: request.accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
			mode: "research" as const,
			text: request.accountId,
			url: "https://example.com/conversation",
			artifactId: request.accountId === "gemini-thinker" ? "d".repeat(64) : "e".repeat(64),
			totalChars: request.accountId.length,
		}));
		const tool = defineInternetResearchTool({ execute } as never, config, allowed);

		const result = await tool.execute(
			{ query: "Compare", accounts: ["chatgpt-thinker", "gemini-thinker"] },
			{ agent: { id: "agent" }, callId: "call-shared", signal: new AbortController().signal } as never,
		);

		expect(result.state).toBe("completed");
		expect(execute.mock.calls.map(([request]) => [request.accountId, request.logicalRequestId])).toEqual([
			["chatgpt-thinker", "call-shared"],
			["gemini-thinker", "call-shared"],
		]);
	});

	it("rejects a disabled account without routing by provider", async () => {
		const execute = vi.fn();
		const tool = defineInternetResearchTool({ execute } as never, config, new Set(["gemini-thinker"] as const));
		await expect(
			tool.execute(
				{ query: "x", accounts: ["chatgpt-thinker"] },
				{ agent: { id: "agent" }, callId: "call", signal: new AbortController().signal } as never,
			),
		).resolves.toEqual({ state: "failed", results: [] });
		expect(execute).not.toHaveBeenCalled();
	});
});
