import { describe, expect, it } from "vitest";
import { parseTeamArgs } from "#internet/tools/args";

describe("parseTeamArgs", () => {
	it("accepts a valid task", () => {
		expect(parseTeamArgs({ task: "Design a logo" })).toEqual({ task: "Design a logo" });
	});

	it("accepts optional fields", () => {
		expect(
			parseTeamArgs({ task: "T", team: "code", rounds: 3, synthesize: false, startProvider: "gemini-web" }),
		).toEqual({ task: "T", team: "code", rounds: 3, synthesize: false, startProvider: "gemini-web" });
	});

	it("rejects a blank task", () => {
		expect(() => parseTeamArgs({ task: "   " })).toThrow(/non-empty/);
		expect(() => parseTeamArgs({})).toThrow(/non-empty/);
	});

	it("rejects an invalid rounds value", () => {
		expect(() => parseTeamArgs({ task: "T", rounds: 0 })).toThrow(/positive integer/);
		expect(() => parseTeamArgs({ task: "T", rounds: 1.5 })).toThrow(/positive integer/);
		expect(() => parseTeamArgs({ task: "T", rounds: "2" })).toThrow(/positive integer/);
	});

	it("rejects an invalid synthesize value", () => {
		expect(() => parseTeamArgs({ task: "T", synthesize: "yes" })).toThrow(/boolean/);
	});

	it("rejects an invalid startProvider", () => {
		expect(() => parseTeamArgs({ task: "T", startProvider: "claude" })).toThrow(/startProvider must be one of/);
	});

	it("rejects a blank team name", () => {
		expect(() => parseTeamArgs({ task: "T", team: "  " })).toThrow(/non-empty/);
	});
});
