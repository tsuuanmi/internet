import { describe, expect, it, vi } from "vitest";
import { parseResearchArgs } from "#internet/tools/args";
import { defineInternetResearchTool } from "#internet/tools/internet-research";

describe("parseResearchArgs", () => {
	it("accepts explicit thinker accounts", () => {
		expect(
			parseResearchArgs({ query: "Compare two policies", name: "policy", accounts: ["gemini-thinker"], visible: true }),
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

	it("dispatches through the exact account identity", async () => {
		const research = vi.fn(async () => ({
			text: "Report",
			url: "https://gemini.google.com/app/conversation",
			conversationId: "conversation",
		}));
		const tool = defineInternetResearchTool({ research } as never, config, allowed);
		const signal = new AbortController().signal;

		await expect(
			tool.execute(
				{ query: "Compare policies", name: "policy", accounts: ["gemini-thinker"], visible: true },
				{ agent: { id: "agent" }, signal } as never,
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
				},
			],
		});
		expect(research).toHaveBeenCalledWith("gemini-thinker", {
			prompt: "Compare policies",
			sessionId: "agent:research:policy",
			visible: true,
			signal,
		});
	});

	it("rejects a disabled account without routing by provider", async () => {
		const research = vi.fn();
		const tool = defineInternetResearchTool({ research } as never, config, new Set(["gemini-thinker"] as const));
		await expect(
			tool.execute({ query: "x", accounts: ["chatgpt-thinker"] }, { agent: { id: "agent" } } as never),
		).resolves.toEqual({ state: "failed", results: [] });
		expect(research).not.toHaveBeenCalled();
	});
});
