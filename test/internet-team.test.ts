import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { resolveBrowserConfig } from "#internet/core/config";
import { parseTeamArgs } from "#internet/tools/args";
import { defineInternetTeamTool, renderInternetTeamResult } from "#internet/tools/internet-team";

function fakeManager(script: Array<string | Error>) {
	const calls: Array<{ accountId: AccountId; request: ChatRequest }> = [];
	return {
		calls,
		manager: {
			async chat(accountId: AccountId, request: ChatRequest): Promise<ChatResult> {
				calls.push({ accountId, request });
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

const allowed = new Set(["chatgpt-thinker", "gemini-thinker"] as const);

describe("parseTeamArgs", () => {
	it("accepts explicit ordered accounts", () => {
		expect(
			parseTeamArgs({
				task: "T",
				team: "code",
				rounds: 3,
				synthesize: false,
				includeTranscript: true,
				accounts: ["gemini-thinker", "chatgpt-thinker"],
				visible: true,
			}),
		).toEqual({
			task: "T",
			team: "code",
			rounds: 3,
			synthesize: false,
			includeTranscript: true,
			accounts: ["gemini-thinker", "chatgpt-thinker"],
			visible: true,
		});
	});

	it("rejects provider names, duplicates, and too-short account lists", () => {
		expect(() => parseTeamArgs({ task: "T", accounts: ["chatgpt-thinker"] })).toThrow(/at least two/);
		expect(() => parseTeamArgs({ task: "T", accounts: ["chatgpt-web", "gemini-thinker"] })).toThrow(/must be one of/);
		expect(() =>
			parseTeamArgs({ task: "T", accounts: ["chatgpt-thinker", "chatgpt-thinker"] }),
		).toThrow(/duplicates/);
	});
});

describe("renderInternetTeamResult", () => {
	it("renders account identity in an opted-in transcript", () => {
		expect(
			renderInternetTeamResult({
				finalAnswer: "Final",
				transcript: [
					{ round: 1, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "Alpha" },
					{
						round: 1,
						accountId: "gemini-thinker",
						provider: "gemini-web",
						text: "Beta",
						textTruncation: "prefix",
					},
				],
				transcriptTruncated: true,
			}),
		).toContain("### chatgpt-thinker · round 1");
	});
});

describe("defineInternetTeamTool", () => {
	it("uses thinker account identities and hides browsers by default", async () => {
		const { manager, calls } = fakeManager(["A1", "B1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false }, exec);
		expect(result).toEqual({
			finalAnswer: "B1",
			finalAccountId: "gemini-thinker",
			finalProvider: "gemini-web",
		});
		expect(calls.map(({ accountId }) => accountId)).toEqual(["chatgpt-thinker", "gemini-thinker"]);
		expect(calls.map(({ request }) => request.visible)).toEqual([undefined, undefined]);
	});

	it("synthesizes through chatgpt-thinker even though Gemini speaks last", async () => {
		const { manager, calls } = fakeManager(["A1", "B1", "FINAL"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(calls.map(({ accountId }) => accountId)).toEqual([
			"chatgpt-thinker",
			"gemini-thinker",
			"chatgpt-thinker",
		]);
		expect(result).toMatchObject({
			finalAnswer: "FINAL",
			finalAccountId: "chatgpt-thinker",
			finalProvider: "chatgpt-web",
			transcriptTruncated: false,
		});
	});

	it("returns account identity on an opted-in failure", async () => {
		const { manager } = fakeManager(["A1", new Error("boom")]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(result).toMatchObject({
			isError: true,
			error: "gemini-thinker: boom",
			transcript: [
				{ round: 1, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "A1" },
			],
		});
	});

	it("rejects a non-thinker account instead of routing it by provider", async () => {
		const { manager, calls } = fakeManager([]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute(
			{ task: "T", accounts: ["chatgpt-writer", "gemini-thinker"] },
			exec,
		);
		expect(result).toMatchObject({ isError: true });
		expect(calls).toEqual([]);
	});

	it("declares a timeout covering configured account turns and synthesis", () => {
		const { manager } = fakeManager([]);
		const tool = defineInternetTeamTool(
			manager,
			resolveBrowserConfig({ turnTimeoutMs: 100, teamMaxRounds: 4 }),
			allowed,
		);
		expect(tool.timeoutMs).toBe(900);
	});
});
