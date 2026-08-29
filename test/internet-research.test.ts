import { describe, expect, it } from "vitest";
import { parseResearchArgs } from "#internet/tools/args";

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
