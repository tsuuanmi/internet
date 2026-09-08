import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ConversationStore,
	parseChatGptConversationUrl,
	parseGeminiConversationUrl,
} from "#internet/browser/conversations";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "internet-conversations-"));
	temporaryRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("conversation URL parsers", () => {
	it("accepts only canonical ChatGPT conversation URLs", () => {
		expect(parseChatGptConversationUrl("https://chatgpt.com/c/abc-123_X")).toEqual({
			id: "abc-123_X",
			url: "https://chatgpt.com/c/abc-123_X",
		});
		expect(() => parseChatGptConversationUrl("https://chatgpt.com/c/abc?temporary=true")).toThrow(/Invalid/);
		expect(() => parseChatGptConversationUrl("https://example.com/c/abc")).toThrow(/Invalid/);
	});

	it("accepts only canonical Gemini conversation URLs", () => {
		expect(parseGeminiConversationUrl("https://gemini.google.com/app/abc-123_X")).toEqual({
			id: "abc-123_X",
			url: "https://gemini.google.com/app/abc-123_X",
		});
		expect(() => parseGeminiConversationUrl("https://gemini.google.com/app")).toThrow(/Invalid/);
		expect(() => parseGeminiConversationUrl("https://gemini.google.com/app/abc?temporary=true")).toThrow(/Invalid/);
		expect(() => parseGeminiConversationUrl("https://example.com/app/abc")).toThrow(/Invalid/);
	});
});

describe("ConversationStore", () => {
	it.each([
		["chatgpt-thinker", "https://chatgpt.com/c/chat-one"],
		["chatgpt-writer", "https://chatgpt.com/c/chat-one"],
		["gemini-thinker", "https://gemini.google.com/app/gem-one"],
	] as const)("persists private v2 bindings under the %s account namespace", (accountId, conversationUrl) => {
		const root = temporaryRoot();
		const store = new ConversationStore(root, accountId);
		const first = store.bind("1-1", conversationUrl);
		expect(first).toMatchObject({ version: 2, accountId, revision: 1 });

		const directory = join(root, accountId, "conversations");
		const files = readdirSync(directory);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
		expect(files[0]).not.toContain("1-1");
		if (process.platform !== "win32") {
			expect(statSync(directory).mode & 0o777).toBe(0o700);
			expect(statSync(join(directory, files[0] ?? "")).mode & 0o777).toBe(0o600);
		}

		const restored = new ConversationStore(root, accountId).read("1-1");
		expect(restored?.conversationUrl).toBe(conversationUrl);
		expect(store.bind("1-1", conversationUrl).revision).toBe(2);
	});

	it("keeps thinker and writer bindings isolated even for the same session and provider", () => {
		const root = temporaryRoot();
		const thinker = new ConversationStore(root, "chatgpt-thinker");
		const writer = new ConversationStore(root, "chatgpt-writer");
		thinker.bind("1-1", "https://chatgpt.com/c/thinker-thread");
		writer.bind("1-1", "https://chatgpt.com/c/writer-thread");
		expect(thinker.read("1-1")?.conversationId).toBe("thinker-thread");
		expect(writer.read("1-1")?.conversationId).toBe("writer-thread");
	});

	it("keeps different DSH sessions isolated inside one account", () => {
		const store = new ConversationStore(temporaryRoot(), "gemini-thinker");
		store.bind("1-1", "https://gemini.google.com/app/gem-one");
		store.bind("1-2", "https://gemini.google.com/app/gem-two");
		expect(store.read("1-1")?.conversationId).toBe("gem-one");
		expect(store.read("1-2")?.conversationId).toBe("gem-two");
	});

	it("refuses to rebind one account session to another native conversation", () => {
		const store = new ConversationStore(temporaryRoot(), "chatgpt-thinker");
		store.bind("1-1", "https://chatgpt.com/c/chat-one");
		expect(() => store.bind("1-1", "https://chatgpt.com/c/chat-two")).toThrow(/already bound/);
	});
});
