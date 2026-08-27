import { describe, expect, it } from "vitest";
import { parseChatArgs } from "#internet/tools/args";

describe("parseChatArgs", () => {
	it("accepts a valid provider, prompt, and visibility", () => {
		expect(parseChatArgs({ model: "chatgpt-web", prompt: "Hello" })).toEqual({
			provider: "chatgpt-web",
			prompt: "Hello",
		});
		expect(parseChatArgs({ model: "gemini-web", prompt: "Hi", visible: true })).toEqual({
			provider: "gemini-web",
			prompt: "Hi",
			visible: true,
		});
	});

	it("rejects an unknown provider", () => {
		expect(() => parseChatArgs({ model: "claude", prompt: "Hello" })).toThrow(/model must be one of/);
	});

	it("rejects a blank prompt", () => {
		expect(() => parseChatArgs({ model: "chatgpt-web", prompt: "   " })).toThrow(/non-empty/);
		expect(() => parseChatArgs({ model: "chatgpt-web", prompt: "" })).toThrow(/non-empty/);
	});

	it("rejects invalid visibility", () => {
		expect(() => parseChatArgs({ model: "chatgpt-web", prompt: "Hello", visible: "yes" })).toThrow(/boolean/);
	});
});
