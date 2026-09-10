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

const allowed = new Set(["chatgpt-thinker", "chatgpt-thinker-2", "gemini-thinker"] as const);

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
		expect(() => parseTeamArgs({ task: "T", accounts: ["chatgpt-thinker"] })).toThrow(/at least 2 account/);
		expect(() => parseTeamArgs({ task: "T", accounts: ["chatgpt-web", "gemini-thinker"] })).toThrow(/must be one of/);
		expect(() => parseTeamArgs({ task: "T", accounts: ["chatgpt-thinker", "chatgpt-thinker"] })).toThrow(
			/duplicates/,
		);
	});
});

describe("renderInternetTeamResult", () => {
	it("renders only member identity in an opted-in transcript", () => {
		const output = renderInternetTeamResult({
			finalAnswer: "Final",
			transcript: [
				{ round: 1, member: 1, text: "Alpha" },
				{ round: 1, member: 2, text: "Beta", textTruncation: "prefix" },
			],
			transcriptTruncated: true,
		});
		expect(output).toContain("### Member 1 · round 1");
		expect(output).toContain("### Member 2 · round 1");
		expect(output).not.toContain("chatgpt-thinker");
		expect(output).not.toContain("gemini-thinker");
	});
});

describe("defineInternetTeamTool", () => {
	it("uses two independent ChatGPT accounts as provider-agnostic default members", async () => {
		const { manager, calls } = fakeManager(["A1", "B1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, synthesize: false }, exec);
		expect(result).toEqual({ finalAnswer: "B1", finalMember: 2 });
		expect(calls.map(({ accountId }) => accountId)).toEqual(["chatgpt-thinker", "chatgpt-thinker-2"]);
		expect(calls.map(({ request }) => request.visible)).toEqual([undefined, undefined]);
		expect(calls.every(({ request }) => !request.prompt.includes("ChatGPT") && !request.prompt.includes("Gemini"))).toBe(true);
	});

	it("synthesizes through Member 1 and projects provider-agnostic transcript metadata", async () => {
		const { manager, calls } = fakeManager(["A1", "B1", "FINAL"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(calls.map(({ accountId }) => accountId)).toEqual([
			"chatgpt-thinker",
			"chatgpt-thinker-2",
			"chatgpt-thinker",
		]);
		expect(result).toMatchObject({
			finalAnswer: "FINAL",
			finalMember: 1,
			transcript: [
				{ round: 1, member: 1, text: "A1" },
				{ round: 1, member: 2, text: "B1" },
			],
			transcriptTruncated: false,
		});
	});

	it("returns member-facing error plus backing account/provider diagnostics", async () => {
		const { manager } = fakeManager(["A1", new Error("boom")]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", rounds: 1, includeTranscript: true }, exec);
		expect(result).toMatchObject({
			isError: true,
			error: "Member 2 failed: boom",
			diagnostic: "chatgpt-thinker-2 · chatgpt-web · unexpected_error",
			transcript: [{ round: 1, member: 1, text: "A1" }],
		});
	});

	it("still supports explicit Gemini composition without exposing provider identity to prompts", async () => {
		const { manager, calls } = fakeManager(["G1", "C1"]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute(
			{ task: "T", rounds: 1, synthesize: false, accounts: ["gemini-thinker", "chatgpt-thinker"] },
			exec,
		);
		expect(result).toEqual({ finalAnswer: "C1", finalMember: 2 });
		expect(calls[0]?.request.prompt).toContain("Member 1");
		expect(calls[1]?.request.prompt).toContain("Member 2");
		expect(calls.every(({ request }) => !request.prompt.includes("Gemini") && !request.prompt.includes("ChatGPT"))).toBe(true);
	});

	it("rejects a non-thinker account instead of routing it by provider", async () => {
		const { manager, calls } = fakeManager([]);
		const tool = defineInternetTeamTool(manager, resolveBrowserConfig({}), allowed);
		const result = await tool.execute({ task: "T", accounts: ["chatgpt-writer", "gemini-thinker"] }, exec);
		expect(result).toMatchObject({ isError: true });
		expect(calls).toEqual([]);
	});

	it("declares a timeout covering the largest allowed team and synthesis", () => {
		const { manager } = fakeManager([]);
		const tool = defineInternetTeamTool(
			manager,
			resolveBrowserConfig({ turnTimeoutMs: 100, teamMaxRounds: 4 }),
			allowed,
		);
		expect(tool.timeoutMs).toBe(1300);
	});
});
