import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";
import { projectWebsiteParticipantResult, WebsiteParticipantService } from "#internet/participant/service";

const roots: string[] = [];

function artifactStore(): WebsiteParticipantArtifactStore {
	const root = mkdtempSync(join(tmpdir(), "internet-participant-"));
	roots.push(root);
	return new WebsiteParticipantArtifactStore(root);
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("WebsiteParticipantService", () => {
	it("uses the DSH tool call as the durable provider request identity and persists one completed result", async () => {
		const chat = vi.fn(async () => ({
			text: "website answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
		}));
		const research = vi.fn();
		const artifacts = artifactStore();
		const service = new WebsiteParticipantService({ chat, research } as never, artifacts);
		const signal = new AbortController().signal;

		const first = await service.execute({
			ownerSessionId: "teammate-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "call-42",
			mode: "chat",
			prompt: "Inspect the source",
			visible: true,
			signal,
		});
		const repeated = await service.execute({
			ownerSessionId: "teammate-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "call-42",
			mode: "chat",
			prompt: "Inspect the source",
			visible: true,
			signal,
		});

		expect(repeated).toEqual(first);
		expect(chat).toHaveBeenCalledTimes(1);
		expect(chat).toHaveBeenCalledWith("chatgpt-thinker", {
			prompt: "Inspect the source",
			sessionId: "teammate-session",
			requestId: "call-42",
			visible: true,
			preserveFullResult: true,
			signal,
		});
		expect(research).not.toHaveBeenCalled();
		expect(first).toMatchObject({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			mode: "chat",
			text: "website answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
			totalChars: 14,
			artifactId: expect.stringMatching(/^[0-9a-f]{64}$/u),
		});
		expect(artifacts.read("teammate-session", first.artifactId)).toMatchObject({
			text: "website answer",
			promptHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
		});
	});

	it("routes provider-native research through the same durable participant boundary", async () => {
		const chat = vi.fn();
		const research = vi.fn(async () => ({
			text: "research report",
			url: "https://gemini.google.com/app/native",
			conversationId: "native",
		}));
		const service = new WebsiteParticipantService({ chat, research } as never, artifactStore());
		const signal = new AbortController().signal;

		const result = await service.execute({
			ownerSessionId: "teammate-session",
			conversationSessionId: "teammate-session:research:architecture",
			accountId: "gemini-thinker",
			logicalRequestId: "call-research",
			mode: "research",
			prompt: "Research the architecture",
			signal,
		});

		expect(research).toHaveBeenCalledWith("gemini-thinker", {
			prompt: "Research the architecture",
			sessionId: "teammate-session:research:architecture",
			requestId: "call-research",
			visible: false,
			preserveFullResult: true,
			signal,
		});
		expect(chat).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			mode: "research",
			provider: "gemini-web",
			text: "research report",
			totalChars: 15,
		});
	});

	it("rejects logical request reuse with different input after completion", async () => {
		const chat = vi.fn(async () => ({
			text: "answer",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
		}));
		const service = new WebsiteParticipantService({ chat, research: vi.fn() } as never, artifactStore());

		await service.execute({
			ownerSessionId: "teammate-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "call-1",
			mode: "chat",
			prompt: "first",
		});

		await expect(
			service.execute({
				ownerSessionId: "teammate-session",
				accountId: "chatgpt-thinker",
				logicalRequestId: "call-1",
				mode: "chat",
				prompt: "different",
			}),
		).rejects.toThrow(/different prompt/i);
		expect(chat).toHaveBeenCalledTimes(1);
	});
});

describe("website participant artifact projection", () => {
	it("keeps short results inline and spills long results behind an owner-scoped artifact", () => {
		const artifacts = artifactStore();
		const artifact = artifacts.create({
			ownerSessionId: "teammate-session",
			accountId: "chatgpt-thinker",
			logicalRequestId: "call-long",
			mode: "chat",
			prompt: "long",
			text: "abcdefghijklmnop",
			url: "https://chatgpt.com/c/native",
			conversationId: "native",
		});
		const result = {
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			mode: "chat" as const,
			text: artifact.text,
			url: artifact.url,
			conversationId: artifact.conversationId,
			artifactId: artifact.artifactId,
			totalChars: artifact.text.length,
		};

		expect(projectWebsiteParticipantResult(result, 32)).toEqual({
			text: "abcdefghijklmnop",
			artifactId: artifact.artifactId,
			totalChars: 16,
			truncated: false,
		});
		expect(projectWebsiteParticipantResult(result, 8)).toEqual({
			text: "abcdefgh",
			artifactId: artifact.artifactId,
			totalChars: 16,
			truncated: true,
			nextOffset: 8,
		});
		expect(artifacts.readText("teammate-session", artifact.artifactId, { offset: 8, maxChars: 4 })).toEqual({
			text: "ijkl",
			offset: 8,
			totalChars: 16,
			nextOffset: 12,
		});
		expect(() => artifacts.readText("other-session", artifact.artifactId, { offset: 0, maxChars: 4 })).toThrow(
			/does not belong/i,
		);
	});
});
