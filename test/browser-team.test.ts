import { describe, expect, it } from "vitest";
import { parseTeamArgs } from "#internet/tools/args";

describe("parseTeamArgs", () => {
	it("accepts a valid task", () => {
		expect(parseTeamArgs({ task: "Design a logo" })).toEqual({ task: "Design a logo" });
	});

	it("accepts optional fields", () => {
		expect(
			parseTeamArgs({
				task: "T",
				team: "code",
				rounds: 3,
				synthesize: false,
				providers: ["gemini-web", "chatgpt-web"],
			}),
		).toEqual({ task: "T", team: "code", rounds: 3, synthesize: false, providers: ["gemini-web", "chatgpt-web"] });
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

	it("rejects a non-array or too-short providers value", () => {
		expect(() => parseTeamArgs({ task: "T", providers: "chatgpt-web" })).toThrow(/at least two/);
		expect(() => parseTeamArgs({ task: "T", providers: ["chatgpt-web"] })).toThrow(/at least two/);
	});

	it("rejects an invalid provider element", () => {
		expect(() => parseTeamArgs({ task: "T", providers: ["claude", "chatgpt-web"] })).toThrow(
			/providers must be one of/,
		);
	});

	it("rejects duplicate providers", () => {
		expect(() => parseTeamArgs({ task: "T", providers: ["chatgpt-web", "chatgpt-web"] })).toThrow(/duplicates/);
	});

	it("rejects a blank team name", () => {
		expect(() => parseTeamArgs({ task: "T", team: "  " })).toThrow(/non-empty/);
	});
});
