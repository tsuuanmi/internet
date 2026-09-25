import { describe, expect, it, vi } from "vitest";
import { defineInternetArtifactTool } from "#internet/tools/internet-artifact";

describe("internet_artifact", () => {
	it("reads an owner-scoped exact artifact range", async () => {
		const readText = vi.fn(() => ({
			text: "evidence",
			offset: 10,
			totalChars: 42,
			nextOffset: 18,
		}));
		const tool = defineInternetArtifactTool({ readText } as never);
		const signal = new AbortController().signal;

		await expect(
			tool.execute(
				{ artifact_id: "a".repeat(64), offset: 10, max_chars: 8 },
				{ agent: { id: "teammate-session" }, callId: "call-read", signal } as never,
			),
		).resolves.toEqual({
			text: "evidence",
			artifactId: "a".repeat(64),
			offset: 10,
			totalChars: 42,
			nextOffset: 18,
		});
		expect(readText).toHaveBeenCalledWith("teammate-session", "a".repeat(64), {
			offset: 10,
			maxChars: 8,
		});
	});

	it("fails closed without an agent-backed owner", async () => {
		const readText = vi.fn();
		const tool = defineInternetArtifactTool({ readText } as never);

		await expect(
			tool.execute(
				{ artifact_id: "a".repeat(64) },
				{ callId: "call-read", signal: new AbortController().signal } as never,
			),
		).resolves.toMatchObject({
			isError: true,
			text: expect.stringContaining("agent-backed DSH session"),
		});
		expect(readText).not.toHaveBeenCalled();
	});

	it("rejects invalid artifact ids and ranges before storage access", async () => {
		const readText = vi.fn();
		const tool = defineInternetArtifactTool({ readText } as never);
		const exec = {
			agent: { id: "teammate-session" },
			callId: "call-read",
			signal: new AbortController().signal,
		} as never;

		await expect(tool.execute({ artifact_id: "bad" }, exec)).resolves.toMatchObject({ isError: true });
		await expect(
			tool.execute({ artifact_id: "a".repeat(64), offset: -1 }, exec),
		).resolves.toMatchObject({ isError: true });
		await expect(
			tool.execute({ artifact_id: "a".repeat(64), max_chars: 0 }, exec),
		).resolves.toMatchObject({ isError: true });
		expect(readText).not.toHaveBeenCalled();
	});
});
