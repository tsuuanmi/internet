import { describe, expect, it } from "vitest";
import { parseChatArgs } from "#internet/tools/args";

describe("parseChatArgs", () => {
	it("accepts an explicit account, prompt, and visibility", () => {
		expect(parseChatArgs({ account: "chatgpt-thinker", prompt: "Hello" })).toEqual({
			accountId: "chatgpt-thinker",
			prompt: "Hello",
		});
		expect(parseChatArgs({ account: "gemini-thinker", prompt: "Hi", visible: true })).toEqual({
			accountId: "gemini-thinker",
			prompt: "Hi",
			visible: true,
		});
	});

	it("rejects provider names and unknown accounts", () => {
		expect(() => parseChatArgs({ account: "chatgpt-web", prompt: "Hello" })).toThrow(/account must be one of/);
		expect(() => parseChatArgs({ account: "claude", prompt: "Hello" })).toThrow(/account must be one of/);
	});

	it("rejects a blank prompt", () => {
		expect(() => parseChatArgs({ account: "chatgpt-thinker", prompt: "   " })).toThrow(/non-empty/);
	});

	it("rejects invalid visibility", () => {
		expect(() => parseChatArgs({ account: "chatgpt-thinker", prompt: "Hello", visible: "yes" })).toThrow(/boolean/);
	});
});
