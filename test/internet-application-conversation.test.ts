import { describe, expect, it, vi } from "vitest";
import {
	type InternetApplicationRequestContext,
	InternetChatApplicationService,
	InternetResearchApplicationService,
} from "#internet/application";

const protocolContext: InternetApplicationRequestContext = {
	ownerSessionId: "website-peer-member-a",
	conversationSessionId: "a2a-context-1",
	requestId: "a2a-message-1",
	signal: new AbortController().signal,
};

describe("protocol-neutral Internet conversation identity", () => {
	it("passes an explicit protocol conversation id through chat without replacing owner authority", async () => {
		const execute = vi.fn(async () => ({
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "chat" as const,
			text: "answer",
			url: "https://chatgpt.com/c/native",
			artifactId: "a".repeat(64),
			totalChars: 6,
		}));
		const service = new InternetChatApplicationService({ execute } as never, new Set(["chatgpt-thinker"] as const));

		await service.execute(protocolContext, {
			accountId: "chatgpt-thinker",
			prompt: "Inspect the architecture",
		});

		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "website-peer-member-a",
			conversationSessionId: "a2a-context-1",
			accountId: "chatgpt-thinker",
			logicalRequestId: "a2a-message-1",
			mode: "chat",
			prompt: "Inspect the architecture",
			visible: undefined,
			signal: protocolContext.signal,
		});
	});

	it("passes the same explicit protocol conversation id through provider-native research", async () => {
		const execute = vi.fn(async () => ({
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "research" as const,
			text: "report",
			url: "https://chatgpt.com/research",
			artifactId: "b".repeat(64),
			totalChars: 6,
		}));
		const service = new InternetResearchApplicationService(
			{ execute } as never,
			new Set(["chatgpt-thinker"] as const),
		);

		await service.execute(protocolContext, {
			query: "Research interoperability",
			accountIds: ["chatgpt-thinker"],
			name: "must-not-replace-protocol-context",
		});

		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "website-peer-member-a",
			conversationSessionId: "a2a-context-1",
			accountId: "chatgpt-thinker",
			logicalRequestId: "a2a-message-1",
			mode: "research",
			prompt: "Research interoperability",
			visible: false,
			signal: protocolContext.signal,
		});
	});

	it("fails closed on an explicitly empty conversation id", async () => {
		const execute = vi.fn();
		const service = new InternetChatApplicationService({ execute } as never, new Set(["chatgpt-thinker"] as const));

		await expect(
			service.execute(
				{ ...protocolContext, conversationSessionId: " " },
				{ accountId: "chatgpt-thinker", prompt: "Inspect" },
			),
		).rejects.toThrow("conversation session id");

		expect(execute).not.toHaveBeenCalled();
	});
});
