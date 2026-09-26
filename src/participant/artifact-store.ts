import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashProviderTurnText } from "#internet/browser/turn-receipts";
import { type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { hashCanonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";

export const WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA = "@tsuuanmi/internet-website-participant-artifact" as const;
export type WebsiteParticipantMode = "chat" | "research";

export interface WebsiteParticipantArtifact {
	readonly schema: typeof WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA;
	readonly version: 2;
	readonly artifactId: string;
	readonly ownerSessionHash: string;
	readonly accountId: AccountId;
	readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
	readonly logicalRequestIdHash: string;
	readonly conversationSessionHash: string;
	readonly mode: WebsiteParticipantMode;
	readonly promptHash: string;
	readonly text: string;
	readonly textHash: string;
	readonly url: string;
	readonly conversationId?: string;
	readonly createdAt: string;
}

export interface CreateWebsiteParticipantArtifactInput {
	readonly ownerSessionId: string;
	readonly accountId: AccountId;
	readonly logicalRequestId: string;
	readonly conversationSessionId?: string;
	readonly mode: WebsiteParticipantMode;
	readonly prompt: string;
	readonly text: string;
	readonly url: string;
	readonly conversationId?: string;
}

export interface WebsiteParticipantTextRange {
	readonly text: string;
	readonly offset: number;
	readonly totalChars: number;
	readonly nextOffset?: number;
}

export class WebsiteParticipantArtifactStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebsiteParticipantArtifactStoreError";
	}
}

function identityHash(value: string, name: string): string {
	if (value.trim() === "") throw new WebsiteParticipantArtifactStoreError(`${name} must not be empty`);
	return hashProviderTurnText(value);
}

function hex(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function artifactIdentity(input: {
	readonly ownerSessionId: string;
	readonly accountId: AccountId;
	readonly logicalRequestId: string;
	readonly mode: WebsiteParticipantMode;
}): {
	readonly artifactId: string;
	readonly ownerSessionHash: string;
	readonly logicalRequestIdHash: string;
} {
	const ownerSessionHash = identityHash(input.ownerSessionId, "owner session id");
	const logicalRequestIdHash = identityHash(input.logicalRequestId, "logical request id");
	return {
		ownerSessionHash,
		logicalRequestIdHash,
		artifactId: hashCanonicalJson({
			ownerSessionHash,
			accountId: input.accountId,
			logicalRequestIdHash,
			mode: input.mode,
		}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWebsiteParticipantArtifact(value: unknown): WebsiteParticipantArtifact {
	if (!isRecord(value) || value.schema !== WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA || value.version !== 2) {
		throw new Error("unsupported website participant artifact schema");
	}
	if (
		!hex(value.artifactId) ||
		!hex(value.ownerSessionHash) ||
		!hex(value.logicalRequestIdHash) ||
		!hex(value.conversationSessionHash) ||
		!hex(value.promptHash) ||
		!hex(value.textHash)
	) {
		throw new Error("invalid website participant artifact identity");
	}
	if (typeof value.accountId !== "string") throw new Error("invalid website participant account");
	const accountId = value.accountId as AccountId;
	let provider: ReturnType<typeof getAccountDefinition>["provider"];
	try {
		provider = getAccountDefinition(accountId).provider;
	} catch {
		throw new Error("invalid website participant account");
	}
	if (value.provider !== provider) throw new Error("website participant provider does not match account");
	if (value.mode !== "chat" && value.mode !== "research") throw new Error("invalid website participant mode");
	if (typeof value.text !== "string" || hashProviderTurnText(value.text) !== value.textHash) {
		throw new Error("website participant artifact text hash mismatch");
	}
	if (typeof value.url !== "string" || value.url.trim() === "") throw new Error("invalid website participant URL");
	if (
		value.conversationId !== undefined &&
		(typeof value.conversationId !== "string" || value.conversationId === "")
	) {
		throw new Error("invalid website participant conversation id");
	}
	if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
		throw new Error("invalid website participant artifact timestamp");
	}
	const expectedId = hashCanonicalJson({
		ownerSessionHash: value.ownerSessionHash,
		accountId,
		logicalRequestIdHash: value.logicalRequestIdHash,
		mode: value.mode,
	});
	if (value.artifactId !== expectedId) throw new Error("website participant artifact id does not match identity");
	return value as unknown as WebsiteParticipantArtifact;
}

export class WebsiteParticipantArtifactStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "participants", "artifacts");
	}

	create(input: CreateWebsiteParticipantArtifactInput): WebsiteParticipantArtifact {
		if (input.prompt.trim() === "") throw new WebsiteParticipantArtifactStoreError("prompt must not be empty");
		if (input.text.trim() === "") throw new WebsiteParticipantArtifactStoreError("result text must not be empty");
		if (input.url.trim() === "") throw new WebsiteParticipantArtifactStoreError("result URL must not be empty");
		const identity = artifactIdentity(input);
		const current = this.read(input.ownerSessionId, identity.artifactId);
		const promptHash = hashProviderTurnText(input.prompt);
		const conversationSessionHash = identityHash(
			input.conversationSessionId ?? input.ownerSessionId,
			"conversation session id",
		);
		const textHash = hashProviderTurnText(input.text);
		if (current !== undefined) {
			if (current.accountId !== input.accountId || current.mode !== input.mode) {
				throw new WebsiteParticipantArtifactStoreError("website participant artifact identity conflict");
			}
			if (
				current.logicalRequestIdHash !== identity.logicalRequestIdHash ||
				current.promptHash !== promptHash
			) {
				throw new WebsiteParticipantArtifactStoreError(
					"website participant logical request was reused with a different prompt",
				);
			}
			if (current.conversationSessionHash !== conversationSessionHash) {
				throw new WebsiteParticipantArtifactStoreError(
					"website participant logical request was reused with a different conversation session",
				);
			}
			if (
				current.textHash !== textHash ||
				current.url !== input.url ||
				current.conversationId !== input.conversationId
			) {
				throw new WebsiteParticipantArtifactStoreError(
					"website participant logical request completed with conflicting result content",
				);
			}
			return current;
		}
		const artifact: WebsiteParticipantArtifact = {
			schema: WEBSITE_PARTICIPANT_ARTIFACT_SCHEMA,
			version: 2,
			artifactId: identity.artifactId,
			ownerSessionHash: identity.ownerSessionHash,
			accountId: input.accountId,
			provider: getAccountDefinition(input.accountId).provider,
			logicalRequestIdHash: identity.logicalRequestIdHash,
			conversationSessionHash,
			mode: input.mode,
			promptHash,
			text: input.text,
			textHash,
			url: input.url,
			...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
			createdAt: new Date().toISOString(),
		};
		parseWebsiteParticipantArtifact(artifact);
		ensurePrivateDirectory(this.root);
		writePrivateJson(this.path(artifact.artifactId), artifact);
		return artifact;
	}

	readForRequest(
		ownerSessionId: string,
		accountId: AccountId,
		logicalRequestId: string,
		mode: WebsiteParticipantMode,
	): WebsiteParticipantArtifact | undefined {
		const identity = artifactIdentity({ ownerSessionId, accountId, logicalRequestId, mode });
		return this.read(ownerSessionId, identity.artifactId);
	}

	read(ownerSessionId: string, artifactId: string): WebsiteParticipantArtifact | undefined {
		if (!/^[0-9a-f]{64}$/u.test(artifactId)) {
			throw new WebsiteParticipantArtifactStoreError("artifact id must be 64 lowercase hex characters");
		}
		const path = this.path(artifactId);
		if (!existsSync(path)) return undefined;
		const stat = lstatSync(path);
		if (!stat.isFile())
			throw new WebsiteParticipantArtifactStoreError(`artifact ${artifactId} is not a regular file`);
		if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
			throw new WebsiteParticipantArtifactStoreError(`artifact ${artifactId} permissions must be 0600`);
		}
		let artifact: WebsiteParticipantArtifact;
		try {
			artifact = parseWebsiteParticipantArtifact(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WebsiteParticipantArtifactStoreError(
				`artifact ${artifactId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (artifact.ownerSessionHash !== identityHash(ownerSessionId, "owner session id")) {
			throw new WebsiteParticipantArtifactStoreError(`artifact ${artifactId} does not belong to this DSH session`);
		}
		return artifact;
	}

	readText(
		ownerSessionId: string,
		artifactId: string,
		options: { readonly offset: number; readonly maxChars: number },
	): WebsiteParticipantTextRange {
		if (!Number.isSafeInteger(options.offset) || options.offset < 0) {
			throw new WebsiteParticipantArtifactStoreError("artifact offset must be a non-negative integer");
		}
		if (!Number.isSafeInteger(options.maxChars) || options.maxChars < 1) {
			throw new WebsiteParticipantArtifactStoreError("artifact max chars must be a positive integer");
		}
		const artifact = this.read(ownerSessionId, artifactId);
		if (artifact === undefined)
			throw new WebsiteParticipantArtifactStoreError(`artifact ${artifactId} was not found`);
		const totalChars = artifact.text.length;
		const offset = Math.min(options.offset, totalChars);
		const end = Math.min(totalChars, offset + options.maxChars);
		return {
			text: artifact.text.slice(offset, end),
			offset,
			totalChars,
			...(end < totalChars ? { nextOffset: end } : {}),
		};
	}

	private path(artifactId: string): string {
		return join(this.root, `${artifactId}.json`);
	}
}
