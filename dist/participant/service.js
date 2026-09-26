import { hashProviderTurnText } from "#internet/browser/turn-receipts";
export const DEFAULT_WEBSITE_RESULT_INLINE_CHARS = 12_000;
function resultFromArtifact(artifact) {
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
function browserRequest(request) {
    return {
        prompt: request.prompt,
        sessionId: request.conversationSessionId ?? request.ownerSessionId,
        requestId: request.logicalRequestId,
        visible: request.visible === true,
        preserveFullResult: true,
        signal: request.signal,
    };
}
export class WebsiteParticipantService {
    constructor(browser, artifacts) {
        this.browser = browser;
        this.artifacts = artifacts;
    }
    async execute(request) {
        if (request.ownerSessionId.trim() === "")
            throw new Error("website participant owner session id must not be empty");
        if (request.logicalRequestId.trim() === "")
            throw new Error("website participant logical request id must not be empty");
        if (request.prompt.trim() === "")
            throw new Error("website participant prompt must not be empty");
        const existing = this.artifacts.readForRequest(request.ownerSessionId, request.accountId, request.logicalRequestId, request.mode);
        if (existing !== undefined) {
            if (existing.promptHash !== hashProviderTurnText(request.prompt)) {
                throw new Error("website participant logical request was reused with a different prompt");
            }
            return resultFromArtifact(existing);
        }
        const execute = request.mode === "research" ? this.browser.research.bind(this.browser) : this.browser.chat.bind(this.browser);
        const result = await execute(request.accountId, browserRequest(request));
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
export function projectWebsiteParticipantResult(result, inlineMaxChars = DEFAULT_WEBSITE_RESULT_INLINE_CHARS) {
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
//# sourceMappingURL=service.js.map