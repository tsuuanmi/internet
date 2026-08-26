import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ChatGptConversationStore,
	GeminiConversationStore,
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

describe("parseChatGptConversationUrl", () => {
	it("accepts only canonical ChatGPT conversation URLs", () => {
		expect(parseChatGptConversationUrl("https://chatgpt.com/c/abc-123_X")).toEqual({
			id: "abc-123_X",
			url: "https://chatgpt.com/c/abc-123_X",
		});
		expect(() => parseChatGptConversationUrl("https://chatgpt.com/c/abc?temporary=true")).toThrow(/Invalid/);
		expect(() => parseChatGptConversationUrl("https://example.com/c/abc")).toThrow(/Invalid/);
	});
});

describe("ChatGptConversationStore", () => {
	it("persists one private stable binding per hashed DSH session", () => {
		const root = temporaryRoot();
		const store = new ChatGptConversationStore(root);
		const first = store.bind("1-1", "https://chatgpt.com/c/chat-one");
		expect(first.conversationId).toBe("chat-one");
		expect(first.revision).toBe(1);

		const directory = join(root, "chatgpt-web", "conversations");
		const files = readdirSync(directory);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
		expect(files[0]).not.toContain("1-1");
		expect(statSync(directory).mode & 0o777).toBe(0o700);
		expect(statSync(join(directory, files[0] ?? "")).mode & 0o777).toBe(0o600);

		const restored = new ChatGptConversationStore(root).read("1-1");
		expect(restored?.conversationUrl).toBe("https://chatgpt.com/c/chat-one");
		expect(store.bind("1-1", "https://chatgpt.com/c/chat-one").revision).toBe(2);
		expect(() => store.bind("1-1", "https://chatgpt.com/c/chat-two")).toThrow(/already bound/);
	});

	it("keeps different DSH sessions isolated", () => {
		const store = new ChatGptConversationStore(temporaryRoot());
		store.bind("1-1", "https://chatgpt.com/c/chat-one");
		store.bind("1-2", "https://chatgpt.com/c/chat-two");
		expect(store.read("1-1")?.conversationId).toBe("chat-one");
		expect(store.read("1-2")?.conversationId).toBe("chat-two");
	});
});

describe("parseGeminiConversationUrl", () => {
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

describe("GeminiConversationStore", () => {
	it("persists one private stable binding per hashed DSH session", () => {
		const root = temporaryRoot();
		const store = new GeminiConversationStore(root);
		const first = store.bind("1-1", "https://gemini.google.com/app/gem-one");
		expect(first.conversationId).toBe("gem-one");
		expect(first.revision).toBe(1);

		const directory = join(root, "gemini-web", "conversations");
		const files = readdirSync(directory);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
		expect(files[0]).not.toContain("1-1");
		expect(statSync(directory).mode & 0o777).toBe(0o700);
		expect(statSync(join(directory, files[0] ?? "")).mode & 0o777).toBe(0o600);

		const restored = new GeminiConversationStore(root).read("1-1");
		expect(restored?.conversationUrl).toBe("https://gemini.google.com/app/gem-one");
		expect(store.bind("1-1", "https://gemini.google.com/app/gem-one").revision).toBe(2);
		expect(() => store.bind("1-1", "https://gemini.google.com/app/gem-two")).toThrow(/already bound/);
	});

	it("keeps different DSH sessions isolated", () => {
		const store = new GeminiConversationStore(temporaryRoot());
		store.bind("1-1", "https://gemini.google.com/app/gem-one");
		store.bind("1-2", "https://gemini.google.com/app/gem-two");
		expect(store.read("1-1")?.conversationId).toBe("gem-one");
		expect(store.read("1-2")?.conversationId).toBe("gem-two");
	});
});
