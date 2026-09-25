import { defineTool } from "@deepseek-ai/dsh-tools";
import type { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";

const DEFAULT_ARTIFACT_READ_CHARS = 12_000;
const MAX_ARTIFACT_READ_CHARS = 50_000;

function parseArtifactId(value: unknown): string {
	if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
		throw new Error("internet_artifact artifact_id must be 64 lowercase hex characters");
	}
	return value;
}

function parseOffset(value: unknown): number {
	if (value === undefined) return 0;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new Error("internet_artifact offset must be a non-negative integer");
	}
	return value;
}

function parseMaxChars(value: unknown): number {
	if (value === undefined) return DEFAULT_ARTIFACT_READ_CHARS;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_ARTIFACT_READ_CHARS) {
		throw new Error(`internet_artifact max_chars must be an integer from 1 through ${MAX_ARTIFACT_READ_CHARS}`);
	}
	return value;
}

/** Define exact owner-scoped reads over durable website participant results. */
export function defineInternetArtifactTool(
	artifacts: Pick<WebsiteParticipantArtifactStore, "readText">,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_artifact",
		description:
			"Read an exact range from a full website result retained by internet_chat or internet_research. Artifacts are scoped to the current DSH session.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true,
				description: "Artifact id returned by internet_chat or internet_research.",
			},
			offset: {
				type: "integer",
				description: "Zero-based character offset. Defaults to 0.",
			},
			max_chars: {
				type: "integer",
				description: `Maximum characters to return, from 1 through ${MAX_ARTIFACT_READ_CHARS}. Defaults to ${DEFAULT_ARTIFACT_READ_CHARS}.`,
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: { type: "string", required: true },
					artifactId: { type: "string" },
					offset: { type: "integer" },
					totalChars: { type: "integer" },
					nextOffset: { type: "integer" },
					isError: { type: "boolean" },
				},
			},
			render: (_args, value) => [{ type: "text", text: String((value as { text?: unknown })?.text ?? value) }],
			presentationMeta: (_args, value) => value,
		},
		async execute(args, exec) {
			const ownerSessionId = exec.agent?.id;
			if (ownerSessionId === undefined) {
				return {
					text: "internet_artifact requires an agent-backed DSH session to own the website artifact.",
					isError: true,
				};
			}
			try {
				const artifactId = parseArtifactId(args.artifact_id);
				const offset = parseOffset(args.offset);
				const maxChars = parseMaxChars(args.max_chars);
				const result = artifacts.readText(String(ownerSessionId), artifactId, { offset, maxChars });
				return {
					text: result.text,
					artifactId,
					offset: result.offset,
					totalChars: result.totalChars,
					...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset }),
				};
			} catch (error) {
				return {
					text: `internet_artifact failed: ${error instanceof Error ? error.message : String(error)}`,
					isError: true,
				};
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `artifact · ${String(args.artifact_id).slice(0, 12)}`,
			kind: "other",
		}),
	});
}
