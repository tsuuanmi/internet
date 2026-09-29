import { assertInternetApplicationRequestContext, } from "#internet/application/context";
import { getAccountDefinition } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
import { projectWebsiteParticipantResult } from "#internet/participant/service";
export class InternetChatApplicationService {
    constructor(participant, allowed) {
        this.participant = participant;
        this.allowed = allowed;
    }
    async execute(context, input) {
        assertInternetApplicationRequestContext(context);
        const provider = getAccountDefinition(input.accountId).provider;
        if (!this.allowed.has(input.accountId)) {
            return {
                answer: `internet_chat account ${input.accountId} is not enabled for direct thinker chat.`,
                accountId: input.accountId,
                provider,
                isError: true,
            };
        }
        try {
            const result = await this.participant.execute({
                ownerSessionId: context.ownerSessionId,
                ...(context.conversationSessionId === undefined
                    ? {}
                    : { conversationSessionId: context.conversationSessionId }),
                accountId: input.accountId,
                logicalRequestId: context.requestId,
                mode: "chat",
                prompt: input.prompt,
                visible: input.visible,
                signal: context.signal,
            });
            const projection = projectWebsiteParticipantResult(result);
            return {
                answer: projection.text,
                accountId: input.accountId,
                provider,
                url: result.url,
                ...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
                artifactId: projection.artifactId,
                totalChars: projection.totalChars,
                truncated: projection.truncated,
                ...(projection.nextOffset === undefined ? {} : { nextOffset: projection.nextOffset }),
            };
        }
        catch (error) {
            if (isInternetError(error)) {
                return {
                    answer: `internet_chat failed (${error.kind}): ${error.message}`,
                    accountId: input.accountId,
                    provider,
                    isError: true,
                };
            }
            throw error;
        }
    }
}
//# sourceMappingURL=chat.js.map