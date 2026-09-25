import type { BrowserManager, ChatRequest, ChatResult } from "#internet/browser/runtime";
import { hashProviderTurnText } from "#internet/browser/turn-receipts";
import type { AccountId, getAccountDefinition } from "#internet/core/accounts";
import type {
	WebsiteParticipantArtifact,
	WebsiteParticipantArtifactStore,
	WebsiteParticipantMode,
} from "#internet/participant/artifact-store";

export const DEFAULT_WEBSITE_RESULT_INLINE_CHARS = 12_000;

export interface WebsiteParticipantRequest {
	readonly ownerSessionId: string;
	readonly conversationSessionId?: string;
	readonly accountId: AccountId;
	readonly logicalRequestId: string;
	readonly mode: WebsiteParticipantMode;
	readonly prompt: string;
	readonly visible?: boolean;
	readonly signal?: AbortSignal;
}

export interface WebsiteParticipantResult {
	readonly accountId: AccountId;
	readonly provider: ReturnType<typeof getAccountDefinition>["provider"];
	readonly mode: WebsiteParticipantMode;
	readonly text: string;
	readonly url: string;
	readonly conversationId?: string;
	readonly artifactId: string;
	readonly totalChars: number;
}

export interface WebsiteParticipantProjection {
	readonly text: string;
	readonly artifactId: string;
	readonly totalChars: number;
	readonly truncated: boolean;
	readonly nextOffset?: number;
}

type ParticipantBrowser = Pick<BrowserManager, "chat" | "research">;

function resultFromArtifact(artifact: WebsiteParticipantArtifact): WebsiteParticipantResult {
	return {
		accountId: artifact.accountId,
		provider: artifact.provider,
		mode: artifact.mode,
		text: artifact.text,
		url: artifact.url,
		...(artifact.conversationId === undefined ? {} : { conversationId: artifact.conversationId }),
		artifactId: artifact.artifactId,
		totalChars: artifact.text.length,
	};
}

function browserRequest(request: WebsiteParticipantRequest): ChatRequest {
	return {
		prompt: request.prompt,
		sessionId: request.conversationSessionId ?? request.ownerSessionId,
		requestId: request.logicalRequestId,
		visible: request.visible === true,
		signal: request.signal,
	};
}

export class WebsiteParticipantService {
	constructor(
		private readonly browser: ParticipantBrowser,
		private readonly artifacts: WebsiteParticipantArtifactStore,
	) {}

	async execute(request: WebsiteParticipantRequest): Promise<WebsiteParticipantResult> {
		if (request.ownerSessionId.trim() === "") throw new Error("website participant owner session id must not be empty");
		if (request.logicalRequestId.trim() === "") throw new Error("website participant logical request id must not be empty");
		if (request.prompt.trim() === "") throw new Error("website participant prompt must not be empty");
		const existing = this.artifacts.readForRequest(
			request.ownerSessionId,
			request.accountId,
			request.logicalRequestId,
			request.mode,
		);
		if (existing !== undefined) {
			if (existing.promptHash !== hashProviderTurnText(request.prompt)) {
				throw new Error("website participant logical request was reused with a different prompt");
			}
			return resultFromArtifact(existing);
		}
		const execute = request.mode === "research" ? this.browser.research.bind(this.browser) : this.browser.chat.bind(this.browser);
		const result: ChatResult = await execute(request.accountId, browserRequest(request));
		const artifact = this.artifacts.create({
			ownerSessionId: request.ownerSessionId,
			accountId: request.accountId,
			logicalRequestId: request.logicalRequestId,
			mode: request.mode,
			prompt: request.prompt,
			text: result.text,
			url: result.url,
			...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
		});
		return resultFromArtifact(artifact);
	}
}

export function projectWebsiteParticipantResult(
	result: WebsiteParticipantResult,
	inlineMaxChars = DEFAULT_WEBSITE_RESULT_INLINE_CHARS,
): WebsiteParticipantProjection {
	if (!Number.isSafeInteger(inlineMaxChars) || inlineMaxChars < 1) {
		throw new Error("website participant inline result limit must be a positive integer");
	}
	const end = Math.min(result.totalChars, inlineMaxChars);
	return {
		text: result.text.slice(0, end),
		artifactId: result.artifactId,
		totalChars: result.totalChars,
		truncated: end < result.totalChars,
		...(end < result.totalChars ? { nextOffset: end } : {}),
	};
}
