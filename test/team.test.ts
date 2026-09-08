import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import {
	composeSynthesisPrompt,
	composeTurnPrompt,
	runTeam,
	type TeamResult,
	type TeamSuccess,
} from "#internet/team/orchestrator";

interface RecordedCall {
	accountId: AccountId;
	prompt: string;
	sessionId: string;
	visible?: boolean;
}

function fakeChat(script: Array<string | Error>) {
	const calls: RecordedCall[] = [];
	const chat = async (accountId: AccountId, request: ChatRequest): Promise<ChatResult> => {
		calls.push({ accountId, prompt: request.prompt, sessionId: request.sessionId, visible: request.visible });
		const next = script.shift();
		if (next instanceof Error) throw next;
		if (next === undefined) throw new Error("no more scripted responses");
		return { text: next, url: "https://example.com", conversationId: "c" };
	};
	return { chat, calls };
}

function success(result: TeamResult): TeamSuccess {
	if ("error" in result) throw new Error(result.error.message);
	return result;
}

describe("team prompts", () => {
	it("uses semantic account identities while preserving model display names", () => {
		const prompt = composeTurnPrompt(
			"Task X",
			"chatgpt-thinker",
			[{ accountId: "gemini-thinker", provider: "gemini-web", text: "" }],
			1,
		);
		expect(prompt).toContain("You are ChatGPT on a team with Gemini.");
		expect(prompt).toContain("initial analysis");
	});

	it("includes account-aware transcript contributions in synthesis", () => {
		const prompt = composeSynthesisPrompt("Task X", [
			{ round: 1, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "A1" },
			{ round: 1, accountId: "gemini-thinker", provider: "gemini-web", text: "B1" },
		]);
		expect(prompt).toContain("A1");
		expect(prompt).toContain("B1");
	});
});

describe("runTeam account routing", () => {
	it("uses thinker accounts and synthesizes with chatgpt-thinker by default", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		const result = success(await runTeam(chat, { task: "T", sessionId: "sess" }));
		expect(calls.map((call) => call.accountId)).toEqual([
			"chatgpt-thinker",
			"gemini-thinker",
			"chatgpt-thinker",
			"gemini-thinker",
			"chatgpt-thinker",
		]);
		expect(calls.every((call) => call.sessionId === "sess:team:default")).toBe(true);
		expect(result).toMatchObject({
			finalAnswer: "FINAL",
			finalAccountId: "chatgpt-thinker",
			finalProvider: "chatgpt-web",
		});
		expect(result.transcript[0]).toMatchObject({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			text: "A1",
		});
	});

	it("returns the last account turn when synthesis is disabled", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2"]);
		const result = success(await runTeam(chat, { task: "T", sessionId: "s", synthesize: false, visible: true }));
		expect(result.finalAnswer).toBe("B2");
		expect(result.finalAccountId).toBe("gemini-thinker");
		expect(result.finalProvider).toBe("gemini-web");
		expect(calls.every((call) => call.visible === true)).toBe(true);
	});

	it("allows speaking order to differ from the synthesizer", async () => {
		const { chat, calls } = fakeChat(["G1", "C1", "G2", "C2", "FINAL"]);
		const result = success(
			await runTeam(chat, {
				task: "T",
				sessionId: "s",
				accounts: ["gemini-thinker", "chatgpt-thinker"],
				synthesizer: "chatgpt-thinker",
			}),
		);
		expect(calls.map((call) => call.accountId)).toEqual([
			"gemini-thinker",
			"chatgpt-thinker",
			"gemini-thinker",
			"chatgpt-thinker",
			"chatgpt-thinker",
		]);
		expect(result.finalAccountId).toBe("chatgpt-thinker");
	});

	it("rejects invalid direct account selections", async () => {
		const { chat } = fakeChat([]);
		await expect(runTeam(chat, { task: "T", sessionId: "s", rounds: 0 })).rejects.toThrow(/positive integer/);
		await expect(runTeam(chat, { task: "T", sessionId: "s", accounts: ["chatgpt-thinker"] })).rejects.toThrow(
			/at least two accounts/,
		);
		await expect(
			runTeam(chat, {
				task: "T",
				sessionId: "s",
				accounts: ["chatgpt-thinker", "chatgpt-thinker"],
			}),
		).rejects.toThrow(/duplicates/);
	});

	it("attributes failures to the exact authenticated account", async () => {
		const { chat } = fakeChat(["A1", new Error("boom")]);
		const result = await runTeam(chat, { task: "T", sessionId: "s" });
		if (!("error" in result)) throw new Error("expected team failure");
		expect(result.error).toEqual({ accountId: "gemini-thinker", provider: "gemini-web", message: "boom" });
		expect(result.transcript).toHaveLength(1);
	});

	it("namespaces durable team sessions", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		await runTeam(chat, { task: "T", sessionId: "s", teamName: "review" });
		expect(calls[0]?.sessionId).toBe("s:team:review");
	});
});
