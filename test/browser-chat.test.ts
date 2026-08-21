import { describe, expect, it } from "vitest";
import { parseChatArgs } from "#internet/tools/args";

describe("parseChatArgs", () => {
	it("accepts a valid provider and prompt", () => {
		expect(parseChatArgs({ model: "chatgpt-web", prompt: "Hello" })).toEqual({
			provider: "chatgpt-web",
			prompt: "Hello",
		});
		expect(parseChatArgs({ model: "gemini-web", prompt: "Hi" }).provider).toBe("gemini-web");
	});

	it("rejects an unknown provider", () => {
		expect(() => parseChatArgs({ model: "claude", prompt: "Hello" })).toThrow(/model must be one of/);
	});

	it("rejects a blank prompt", () => {
		expect(() => parseChatArgs({ model: "chatgpt-web", prompt: "   " })).toThrow(/non-empty/);
		expect(() => parseChatArgs({ model: "chatgpt-web", prompt: "" })).toThrow(/non-empty/);
	});
});
