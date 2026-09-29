import { describe, expect, it, vi } from "vitest";
import { type InternetApplicationRequestContext, InternetResearchApplicationService } from "#internet/application";

const context: InternetApplicationRequestContext = {
	ownerSessionId: "portable-host-session",
	requestId: "request-research-42",
	signal: new AbortController().signal,
};

describe("host-neutral Internet research application service", () => {
	const allowed = new Set(["chatgpt-thinker", "gemini-thinker"] as const);

	it("routes provider-native research without any DSH execution object", async () => {
		const execute = vi.fn(
			async (request: { accountId: "chatgpt-thinker" | "gemini-thinker"; conversationSessionId?: string }) => ({
				accountId: request.accountId,
				provider: request.accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
				mode: "research" as const,
				text: "Research report",
				url: "https://example.com/research",
				conversationId: "native-research",
				artifactId: "a".repeat(64),
				totalChars: 15,
			}),
		);
		const service = new InternetResearchApplicationService({ execute } as never, allowed);

		await expect(
			service.execute(context, {
				query: "Compare the architectures",
				name: "architecture",
				accountIds: ["gemini-thinker"],
				visible: true,
			}),
		).resolves.toEqual({
			state: "completed",
			results: [
				{
					accountId: "gemini-thinker",
					provider: "gemini-web",
					state: "completed",
					report: "Research report",
					url: "https://example.com/research",
					conversationId: "native-research",
					artifactId: "a".repeat(64),
					totalChars: 15,
					truncated: false,
				},
			],
		});

		expect(execute).toHaveBeenCalledWith({
			ownerSessionId: "portable-host-session",
			conversationSessionId: "portable-host-session:research:architecture",
			accountId: "gemini-thinker",
			logicalRequestId: "request-research-42",
			mode: "research",
			prompt: "Compare the architectures",
			visible: true,
			signal: context.signal,
		});
	});

	it("keeps enabled-account policy and partial-success aggregation in the application layer", async () => {
		const execute = vi.fn(async (request: { accountId: "chatgpt-thinker" | "gemini-thinker" }) => {
			if (request.accountId === "gemini-thinker") throw new Error("provider stalled");
			return {
				accountId: request.accountId,
				provider: "chatgpt-web" as const,
				mode: "research" as const,
				text: "usable report",
				url: "https://chatgpt.com/research",
				artifactId: "b".repeat(64),
				totalChars: 13,
			};
		});
		const service = new InternetResearchApplicationService({ execute } as never, allowed);

		await expect(
			service.execute(context, {
				query: "Compare",
				accountIds: ["chatgpt-thinker", "gemini-thinker"],
			}),
		).resolves.toMatchObject({
			state: "partial_success",
			results: [
				{ accountId: "chatgpt-thinker", state: "completed", report: "usable report" },
				{ accountId: "gemini-thinker", state: "failed", diagnostic: "Error: provider stalled" },
			],
		});

		const disabled = new InternetResearchApplicationService(
			{ execute: vi.fn() } as never,
			new Set(["gemini-thinker"] as const),
		);
		await expect(
			disabled.execute(context, {
				query: "Compare",
				accountIds: ["chatgpt-thinker"],
			}),
		).resolves.toEqual({ state: "failed", results: [] });
	});

	it("derives default research account selection and preserves the caller AbortSignal", async () => {
		const execute = vi.fn(async (request: {
			accountId: "chatgpt-thinker" | "gemini-thinker";
			logicalRequestId: string;
			signal?: AbortSignal;
			mode: "research";
		}) => ({
			accountId: request.accountId,
			provider: request.accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
			mode: "research" as const,
			text: request.accountId,
			url: "https://example.com/research",
			artifactId: request.accountId === "gemini-thinker" ? "c".repeat(64) : "d".repeat(64),
			totalChars: request.accountId.length,
		}));
		const service = new InternetResearchApplicationService({ execute } as never, allowed);

		const result = await service.execute(context, { query: "Compare" });

		expect(result.state).toBe("completed");
		expect(execute).toHaveBeenCalledTimes(2);
		for (const [request] of execute.mock.calls) {
			expect(request.logicalRequestId).toBe("request-research-42");
			expect(request.signal).toBe(context.signal);
			expect(request.mode).toBe("research");
		}
	});
});
