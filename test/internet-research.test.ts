import { describe, expect, it, vi } from "vitest";
import { parseResearchArgs } from "#internet/tools/args";
import { defineInternetResearchTool } from "#internet/tools/internet-research";

describe("parseResearchArgs", () => {
	it("accepts a query and optional isolated research settings", () => {
		expect(
			parseResearchArgs({ query: "Compare two policies", name: "policy", providers: ["gemini-web"], visible: true }),
		).toEqual({
			query: "Compare two policies",
			name: "policy",
			providers: ["gemini-web"],
			visible: true,
		});
	});

	it("rejects blank queries, duplicate providers, and invalid visibility", () => {
		expect(() => parseResearchArgs({ query: " " })).toThrow(/non-empty/);
		expect(() => parseResearchArgs({ query: "x", providers: ["gemini-web", "gemini-web"] })).toThrow(/duplicates/);
		expect(() => parseResearchArgs({ query: "x", visible: "yes" })).toThrow(/boolean/);
	});
});

describe("internet_research execution", () => {
	const allowed = new Set(["chatgpt-web", "gemini-web"] as const);
	const config = { researchTimeoutMs: 1 } as never;

	it("uses the shared parser to reject duplicate providers before dispatch", async () => {
		const research = vi.fn();
		const tool = defineInternetResearchTool({ research } as never, config, allowed);

		await expect(
			tool.execute({ query: "Compare policies", providers: ["gemini-web", "gemini-web"] }, {
				agent: { id: "agent" },
			} as never),
		).resolves.toEqual({ state: "failed", results: [] });
		expect(research).not.toHaveBeenCalled();
	});

	it("dispatches normalized research input through its isolated owner", async () => {
		const research = vi.fn(async () => ({
			text: "Report",
			url: "https://gemini.google.com/app/conversation",
			conversationId: "conversation",
		}));
		const tool = defineInternetResearchTool({ research } as never, config, allowed);
		const signal = new AbortController().signal;

		await expect(
			tool.execute({ query: "Compare policies", name: "policy", providers: ["gemini-web"], visible: true }, {
				agent: { id: "agent" },
				signal,
			} as never),
		).resolves.toEqual({
			state: "completed",
			results: [
				{
					provider: "gemini-web",
					state: "completed",
					report: "Report",
					url: "https://gemini.google.com/app/conversation",
					conversationId: "conversation",
				},
			],
		});
		expect(research).toHaveBeenCalledWith("gemini-web", {
			prompt: "Compare policies",
			sessionId: "agent:research:policy",
			visible: true,
			signal,
		});
	});
});
