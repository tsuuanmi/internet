import { describe, expect, it, vi } from "vitest";
import {
	type InternetApplicationRequestContext,
	InternetArtifactApplicationService,
	InternetChatApplicationService,
} from "#internet/application";

const context: InternetApplicationRequestContext = {
	ownerSessionId: "portable-host-session",
	requestId: "request-42",
	signal: new AbortController().signal,
};

describe("host-neutral Internet application boundary", () => {
	it("executes chat from stable host identity without any DSH execution object", async () => {
		const execute = vi.fn(async () => ({
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "chat" as const,
			text: "portable answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
			artifactId: "a".repeat(64),
			totalChars: 15,
		}));
		const service = new InternetChatApplicationService({ execute } as never, new Set(["chatgpt-thinker"] as const));

		await expect(
			service.execute(context, {
				accountId: "chatgpt-thinker",
				prompt: "Inspect the repository",
				visible: true,
			}),
		).resolves.toMatchObject({
			answer: "portable answer",
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			artifactId: "a".repeat(64),
			conversationId: "native",
			truncated: false,
		});
		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "portable-host-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "request-42",
			mode: "chat",
			prompt: "Inspect the repository",
			visible: true,
			signal: context.signal,
		});
	});

	it("keeps account availability policy inside the application service", async () => {
		const execute = vi.fn();
		const service = new InternetChatApplicationService({ execute } as never, new Set(["chatgpt-thinker"] as const));

		await expect(
			service.execute(context, {
				accountId: "gemini-thinker",
				prompt: "Inspect",
			}),
		).resolves.toMatchObject({
			isError: true,
			accountId: "gemini-thinker",
			provider: "gemini-web",
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("reads owner-scoped artifacts through the same host-neutral context", () => {
		const readText = vi.fn(() => ({
			text: "evidence",
			offset: 10,
			totalChars: 42,
			nextOffset: 18,
		}));
		const service = new InternetArtifactApplicationService({ readText } as never);

		expect(
			service.read(context, {
				artifactId: "b".repeat(64),
				offset: 10,
				maxChars: 8,
			}),
		).toEqual({
			text: "evidence",
			artifactId: "b".repeat(64),
			offset: 10,
			totalChars: 42,
			nextOffset: 18,
		});
		expect(readText).toHaveBeenCalledWith("portable-host-session", "b".repeat(64), {
			offset: 10,
			maxChars: 8,
		});
	});

	it("rejects empty host identity before reaching participant or artifact storage", async () => {
		const execute = vi.fn();
		const chat = new InternetChatApplicationService({ execute } as never, new Set(["chatgpt-thinker"] as const));
		const readText = vi.fn();
		const artifacts = new InternetArtifactApplicationService({ readText } as never);
		const invalid = { ...context, ownerSessionId: " " };

		await expect(chat.execute(invalid, { accountId: "chatgpt-thinker", prompt: "Inspect" })).rejects.toThrow(
			"owner session id",
		);
		expect(() => artifacts.read(invalid, { artifactId: "b".repeat(64) })).toThrow("owner session id");
		expect(execute).not.toHaveBeenCalled();
		expect(readText).not.toHaveBeenCalled();
	});
});
