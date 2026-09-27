import type { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";
import {
	assertInternetApplicationRequestContext,
	type InternetApplicationRequestContext,
} from "#internet/application/context";

const DEFAULT_ARTIFACT_READ_CHARS = 12_000;
const MAX_ARTIFACT_READ_CHARS = 50_000;

export interface InternetArtifactReadInput {
	readonly artifactId: string;
	readonly offset: number;
	readonly maxChars: number;
}

export interface InternetArtifactReadResult {
	readonly text: string;
	readonly artifactId: string;
	readonly offset: number;
	readonly totalChars: number;
	readonly nextOffset?: number;
}

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

export function parseInternetArtifactReadInput(args: Record<string, unknown>): InternetArtifactReadInput {
	return {
		artifactId: parseArtifactId(args.artifact_id),
		offset: parseOffset(args.offset),
		maxChars: parseMaxChars(args.max_chars),
	};
}

export class InternetArtifactApplicationService {
	private readonly artifacts: Pick<WebsiteParticipantArtifactStore, "readText">;

	constructor(artifacts: Pick<WebsiteParticipantArtifactStore, "readText">) {
		this.artifacts = artifacts;
	}

	read(context: InternetApplicationRequestContext, input: InternetArtifactReadInput): InternetArtifactReadResult {
		assertInternetApplicationRequestContext(context);
		const result = this.artifacts.readText(context.ownerSessionId, input.artifactId, {
			offset: input.offset,
			maxChars: input.maxChars,
		});
		return {
			text: result.text,
			artifactId: input.artifactId,
			offset: result.offset,
			totalChars: result.totalChars,
			...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset }),
		};
	}
}
