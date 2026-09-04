import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import { resolveBrowserConfig } from "#internet/core/config";
import { parseTeamArgs } from "#internet/tools/args";
import { defineInternetTeamTool, renderInternetTeamResult } from "#internet/tools/internet-team";

function fakeManager(script: Array<string | Error>) {
	const calls: Array<{ provider: string; request: ChatRequest }> = [];
	return {
		calls,
		manager: {
			async chat(provider: "chatgpt-web" | "gemini-web", request: ChatRequest): Promise<ChatResult> {
				calls.push({ provider, request });
				const next = script.shift();
				if (next instanceof Error) throw next;
				if (next === undefined) throw new Error("no more scripted responses");
				return { text: next, url: "https://example.com" };
			},
		},
	};
}

const exec = {
	agent: { id: "agent" },
	signal: new AbortController().signal,
	deferContext: () => {},
	concludeTurn: () => {},
} as never;

const allowed = new Set(["chatgpt-web", "gemini-web"] as const);

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
				includeTranscript: true,
				providers: ["gemini-web", "chatgpt-web"],
				visible: true,
			}),
		).toEqual({
			task: "T",
			team: "code",
			rounds: 3,
			synthesize: false,
			includeTranscript: true,
			providers: ["gemini-web", "chatgpt-web"],
			visible: true,
		});
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

	it("rejects invalid boolean options", () => {
		expect(() => parseTeamArgs({ task: "T", synthesize: "yes" })).toThrow(/boolean/);
		expect(() => parseTeamArgs({ task: "T", includeTranscript: "yes" })).toThrow(/boolean/);
		expect(() => parseTeamArgs({ task: "T", visible: "yes" })).toThrow(/boolean/);
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

describe("renderInternetTeamResult", () => {
	it("keeps an opted-in transcript in model-visible content", () => {
		expect(
			renderInternetTeamResult({
				finalAnswer: "Final",
				transcript: [
					{ round: 1, provider: "chatgpt-web", text: "Alpha" },
					{ round: 1, provider: "gemini-web", text: "Beta", textTruncation: "prefix" },
				],
				transcriptTruncated: true,
			}),
		).toBe(
			"Final\n\n---\n\n## Debate transcript (truncated)\n\n### chatgpt-web · round 1\nAlpha\n\n" +
				"### gemini-web · round 1\n[Earlier content omitted]\n\nBeta",
		);
	});

	it("leaves the default final-answer presentation concise", () => {
		expect(renderInternetTeamResult({ finalAnswer: "Final" })).toBe("Final");
	});
});

describe("defineInternetTeamTool", () => {
	it("omits the transcript and hides provider browsers by default", async () => {
		const { manager, calls } = fakeManager(["A1", "B1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false }, exec);
		expect(result).toEqual({ finalAnswer: "B1", finalProvider: "gemini-web" });
		expect(calls.map(({ request }) => request.visible)).toEqual([undefined, undefined]);
	});

	it("propagates an explicit visible-browser request", async () => {
		const { manager, calls } = fakeManager(["A1", "B1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		await tool.execute({ task: "T", rounds: 1, synthesize: false, visible: true }, exec);
		expect(calls.map(({ request }) => request.visible)).toEqual([true, true]);
	});

	it("returns an ordered complete transcript when it fits the budget", async () => {
		const { manager } = fakeManager(["A1", "B1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({ teamTranscriptMaxChars: 4 }), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false, includeTranscript: true }, exec);
		expect(result).toEqual({
			finalAnswer: "B1",
			finalProvider: "gemini-web",
			transcript: [
				{ round: 1, provider: "chatgpt-web", text: "A1" },
				{ round: 1, provider: "gemini-web", text: "B1" },
			],
			transcriptTruncated: false,
		});
		expect(tool.output.render({}, result as never)).toEqual([
			{
				type: "text",
				text: "B1\n\n---\n\n## Debate transcript\n\n### chatgpt-web · round 1\nA1\n\n### gemini-web · round 1\nB1",
			},
		]);
	});

	it("marks a retained boundary turn whose prefix was clipped", async () => {
		const { manager } = fakeManager(["ABCDE", "FGH"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({ teamTranscriptMaxChars: 7 }), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false, includeTranscript: true }, exec);
		expect(result).toEqual({
			finalAnswer: "FGH",
			finalProvider: "gemini-web",
			transcript: [
				{ round: 1, provider: "chatgpt-web", text: "BCDE", textTruncation: "prefix" },
				{ round: 1, provider: "gemini-web", text: "FGH" },
			],
			transcriptTruncated: true,
		});
	});

	it("clips by Unicode code points without splitting an emoji", async () => {
		const { manager } = fakeManager(["X", "A😀B"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({ teamTranscriptMaxChars: 2 }), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false, includeTranscript: true }, exec);
		expect(result).toEqual({
			finalAnswer: "A😀B",
			finalProvider: "gemini-web",
			transcript: [{ round: 1, provider: "gemini-web", text: "😀B", textTruncation: "prefix" }],
			transcriptTruncated: true,
		});
	});

	it("does not include the final synthesis response in the transcript", async () => {
		const { manager } = fakeManager(["A1", "B1", "FINAL"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(result).toEqual({
			finalAnswer: "FINAL",
			finalProvider: "gemini-web",
			transcript: [
				{ round: 1, provider: "chatgpt-web", text: "A1" },
				{ round: 1, provider: "gemini-web", text: "B1" },
			],
			transcriptTruncated: false,
		});
	});

	it("returns completed transcript turns on an opted-in provider failure", async () => {
		const { manager } = fakeManager(["A1", new Error("boom")]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(result).toEqual({
			isError: true,
			error: "gemini-web: boom",
			transcript: [{ round: 1, provider: "chatgpt-web", text: "A1" }],
			transcriptTruncated: false,
		});
	});

	it("rejects rounds above the configured maximum without calling a provider", async () => {
		const { manager, calls } = fakeManager([]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({ teamMaxRounds: 2 }), allowed);
		const result = await tool.execute({ task: "T", rounds: 3 }, exec);
		expect(result).toEqual({
			isError: true,
			error: "internet_team rounds must not exceed the configured maximum of 2.",
		});
		expect(calls).toEqual([]);
	});

	it("declares a timeout covering the configured maximum and synthesis", () => {
		const { manager } = fakeManager([]);
		const tool = defineInternetTeamTool(
			manager,
			resolveBrowserConfig({ turnTimeoutMs: 100, teamMaxRounds: 4 }),
			allowed,
		);
		expect(tool.timeoutMs).toBe(900);
	});
});
