import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
import { composeSynthesisPrompt, composeTurnPrompt, joinNames, runTeam } from "#internet/team/orchestrator";

interface RecordedCall {
	provider: WebProvider;
	prompt: string;
	sessionId: string;
}

/** A fake chat that consumes a script of responses (or thrown errors) in order. */
function fakeChat(script: Array<string | Error>) {
	const calls: RecordedCall[] = [];
	const chat = async (provider: WebProvider, request: ChatRequest): Promise<ChatResult> => {
		calls.push({ provider, prompt: request.prompt, sessionId: request.sessionId });
		const next = script.shift();
		if (next instanceof Error) throw next;
		if (next === undefined) throw new Error("no more scripted responses");
		return { text: next, url: "https://example.com", conversationId: "c" };
	};
	return { chat, calls };
}

describe("joinNames", () => {
	it("joins zero, one, two, and many names", () => {
		expect(joinNames([])).toBe("");
		expect(joinNames(["A"])).toBe("A");
		expect(joinNames(["A", "B"])).toBe("A and B");
		expect(joinNames(["A", "B", "C"])).toBe("A, B, and C");
	});
});

describe("composeTurnPrompt", () => {
	it("produces an opener for round 1 with no prior text", () => {
		const prompt = composeTurnPrompt("Task X", "chatgpt-web", [{ provider: "gemini-web", text: "" }], 1);
		expect(prompt).toContain("initial analysis");
		expect(prompt).toContain("Task X");
		expect(prompt).toContain("You are ChatGPT on a team with Gemini.");
		expect(prompt).not.toContain("Gemini said");
	});

	it("feeds the other model's latest message on later turns", () => {
		const prompt = composeTurnPrompt(
			"Task X",
			"gemini-web",
			[{ provider: "chatgpt-web", text: "ChatGPT's idea" }],
			2,
		);
		expect(prompt).toContain("ChatGPT said");
		expect(prompt).toContain("ChatGPT's idea");
		expect(prompt).toContain("critique");
	});
});

describe("composeSynthesisPrompt", () => {
	it("includes the full transcript and asks for a merged answer", () => {
		const prompt = composeSynthesisPrompt("Task X", [
			{ round: 1, provider: "chatgpt-web", text: "A1" },
			{ round: 1, provider: "gemini-web", text: "B1" },
		]);
		expect(prompt).toContain("best of both");
		expect(prompt).toContain("A1");
		expect(prompt).toContain("B1");
		expect(prompt).toContain("ChatGPT");
		expect(prompt).toContain("Gemini");
	});
});

describe("runTeam", () => {
	it("alternates providers and uses a derived team session id", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		const result = await runTeam(chat, { task: "T", sessionId: "sess" });
		expect(calls.map((c) => c.provider)).toEqual([
			"chatgpt-web",
			"gemini-web",
			"chatgpt-web",
			"gemini-web",
			"gemini-web",
		]);
		expect(calls.every((c) => c.sessionId === "sess:team:default")).toBe(true);
		expect(result.finalAnswer).toBe("FINAL");
		expect(result.finalProvider).toBe("gemini-web");
	});

	it("composes opener, critique, and synthesis prompts in order", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		await runTeam(chat, { task: "Design a logo", sessionId: "s" });
		expect(calls[0].prompt).toContain("initial analysis");
		expect(calls[1].prompt).toContain("A1");
		expect(calls[1].prompt).toContain("critique");
		expect(calls[2].prompt).toContain("B1");
		expect(calls[3].prompt).toContain("A2");
		expect(calls[4].prompt).toContain("best of both");
		expect(calls[4].prompt).toContain("A1");
		expect(calls[4].prompt).toContain("B2");
	});

	it("returns the last turn when synthesis is disabled", async () => {
		const { chat } = fakeChat(["A1", "B1", "A2", "B2"]);
		const result = await runTeam(chat, { task: "T", sessionId: "s", synthesize: false });
		expect(result.finalAnswer).toBe("B2");
		expect(result.finalProvider).toBe("gemini-web");
	});

	it("honors a custom round count", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "A3", "B3", "FINAL"]);
		const result = await runTeam(chat, { task: "T", sessionId: "s", rounds: 3 });
		expect(calls.map((c) => c.provider)).toEqual([
			"chatgpt-web",
			"gemini-web",
			"chatgpt-web",
			"gemini-web",
			"chatgpt-web",
			"gemini-web",
			"gemini-web",
		]);
		expect(result.finalAnswer).toBe("FINAL");
	});

	it("honors a custom provider order", async () => {
		const { chat, calls } = fakeChat(["G1", "C1", "G2", "C2", "FINAL"]);
		const result = await runTeam(chat, {
			task: "T",
			sessionId: "s",
			providers: ["gemini-web", "chatgpt-web"],
		});
		expect(calls.map((c) => c.provider)).toEqual([
			"gemini-web",
			"chatgpt-web",
			"gemini-web",
			"chatgpt-web",
			"chatgpt-web",
		]);
		expect(result.finalProvider).toBe("chatgpt-web");
	});

	it("rejects invalid direct orchestration options", async () => {
		const { chat } = fakeChat([]);
		await expect(runTeam(chat, { task: "T", sessionId: "s", rounds: 0 })).rejects.toThrow(/positive integer/);
		await expect(runTeam(chat, { task: "T", sessionId: "s", providers: ["chatgpt-web"] })).rejects.toThrow(
			/at least two providers/,
		);
		await expect(
			runTeam(chat, { task: "T", sessionId: "s", providers: ["chatgpt-web", "chatgpt-web"] }),
		).rejects.toThrow(/duplicates/);
	});

	it("namespaces the team session id by team name", async () => {
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		await runTeam(chat, { task: "T", sessionId: "s", teamName: "code-review" });
		expect(calls[0].sessionId).toBe("s:team:code-review");
	});

	it("returns a partial error when a provider fails mid-debate", async () => {
		const { chat, calls } = fakeChat(["A1", new Error("boom")]);
		const result = await runTeam(chat, { task: "T", sessionId: "s" });
		expect(result.finalAnswer).toBeUndefined();
		expect(result.error).toEqual({ provider: "gemini-web", message: "boom" });
		expect(calls).toHaveLength(2);
	});

	it("short-circuits on an aborted signal", async () => {
		const controller = new AbortController();
		controller.abort(new Error("cancelled"));
		const { chat, calls } = fakeChat(["A1", "B1", "A2", "B2", "FINAL"]);
		const result = await runTeam(chat, { task: "T", sessionId: "s", signal: controller.signal });
		expect(result.error).toEqual({ provider: "chatgpt-web", message: "cancelled" });
		expect(calls).toHaveLength(0);
	});
});
