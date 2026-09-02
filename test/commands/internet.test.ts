import { describe, expect, it, vi } from "vitest";
import { defineInternetCommand } from "#internet/commands/internet";
import { InternetError } from "#internet/core/errors";

function invocation(rawInput: string) {
	return {
		agent: {
			id: "1-1",
			session: { header: { cwd: "/repo" } },
			followup: () => {},
		},
		rawInput,
		signal: new AbortController().signal,
	};
}

describe("defineInternetCommand", () => {
	it("sends the question to the durable ChatGPT conversation", async () => {
		const chat = vi.fn().mockResolvedValue({ text: "ChatGPT answer", url: "https://chatgpt.com/c/test" });
		const command = defineInternetCommand({ chat });
		const input = invocation("  explain consensus  ");

		await expect(command.handler(input)).resolves.toEqual({ kind: "success", text: "ChatGPT answer" });
		expect(chat).toHaveBeenCalledWith("chatgpt-web", {
			prompt: "explain consensus",
			sessionId: "1-1",
			signal: input.signal,
		});
	});

	it("returns usage without opening the browser for a blank question", async () => {
		const chat = vi.fn();
		const command = defineInternetCommand({ chat });

		await expect(command.handler(invocation("   "))).resolves.toEqual({
			kind: "error",
			text: "A question is required. Usage: /internet <question>",
		});
		expect(chat).not.toHaveBeenCalled();
	});

	it("renders actionable internet failures as command errors", async () => {
		const chat = vi.fn().mockRejectedValue(new InternetError("login_required", "Sign in first."));
		const command = defineInternetCommand({ chat });

		await expect(command.handler(invocation("hello"))).resolves.toEqual({
			kind: "error",
			text: "/internet failed (login_required): Sign in first.",
		});
	});
});
