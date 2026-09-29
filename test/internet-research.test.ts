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

describe("internet_research DSH adapter", () => {
	const config = { researchTimeoutMs: 1 } as never;

	it("delegates host identity and parsed input to the research application service", async () => {
		const execute = vi.fn(async () => ({
			state: "completed" as const,
			results: [],
		}));
		const tool = defineInternetResearchTool({ execute } as never, config);
		const signal = new AbortController().signal;

		await expect(
			tool.execute({ query: "Compare policies", name: "policy", accounts: ["gemini-thinker"], visible: true }, {
				agent: { id: "agent-member" },
				callId: "call-research",
				signal,
			} as never),
		).resolves.toEqual({ state: "completed", results: [] });

		expect(execute).toHaveBeenCalledWith(
			{
				ownerSessionId: "agent-member",
				requestId: "call-research",
				signal,
			},
			{
				query: "Compare policies",
				name: "policy",
				accountIds: ["gemini-thinker"],
				visible: true,
			},
		);
	});

	it("fails closed before application execution when DSH has no agent-backed owner", async () => {
		const execute = vi.fn();
		const tool = defineInternetResearchTool({ execute } as never, config);

		await expect(
			tool.execute({ query: "Compare" }, {
				callId: "call-research",
				signal: new AbortController().signal,
			} as never),
		).resolves.toEqual({ state: "failed", results: [] });
		expect(execute).not.toHaveBeenCalled();
	});

	it("keeps DSH argument validation at the adapter edge", async () => {
		const execute = vi.fn();
		const tool = defineInternetResearchTool({ execute } as never, config);

		await expect(
			tool.execute({ query: " " }, {
				agent: { id: "agent-member" },
				callId: "call-research",
				signal: new AbortController().signal,
			} as never),
		).resolves.toEqual({ state: "failed", results: [] });
		expect(execute).not.toHaveBeenCalled();
	});
});
