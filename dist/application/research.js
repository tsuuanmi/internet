import { assertInternetApplicationRequestContext, } from "#internet/application/context";
import { getAccountDefinition } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
import { projectWebsiteParticipantResult } from "#internet/participant/service";
export class InternetResearchApplicationService {
    constructor(participant, allowed) {
        this.participant = participant;
        this.allowed = allowed;
    }
    async execute(context, input) {
        assertInternetApplicationRequestContext(context);
        if (input.query.trim() === "")
            throw new Error("internet research query must not be empty");
        const accountIds = input.accountIds ?? [...this.allowed];
        if (accountIds.some((accountId) => !this.allowed.has(accountId))) {
            return { state: "failed", results: [] };
        }
        const conversationSessionId = context.conversationSessionId ?? `${context.ownerSessionId}:research:${input.name ?? "default"}`;
        const results = await Promise.all(accountIds.map(async (accountId) => {
            const provider = getAccountDefinition(accountId).provider;
            try {
                const result = await this.participant.execute({
                    ownerSessionId: context.ownerSessionId,
                    conversationSessionId,
                    accountId,
                    logicalRequestId: context.requestId,
                    mode: "research",
                    prompt: input.query,
                    visible: input.visible === true,
                    signal: context.signal,
                });
                const projection = projectWebsiteParticipantResult(result);
                return {
                    accountId,
                    provider,
                    state: "completed",
                    report: projection.text,
                    url: result.url,
                    ...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
                    artifactId: projection.artifactId,
                    totalChars: projection.totalChars,
                    truncated: projection.truncated,
                    ...(projection.nextOffset === undefined ? {} : { nextOffset: projection.nextOffset }),
                };
            }
            catch (error) {
                return {
                    accountId,
                    provider,
                    state: "failed",
                    diagnostic: isInternetError(error) ? `${error.kind}: ${error.message}` : String(error),
                };
            }
        }));
        const completed = results.filter((result) => result.state === "completed").length;
        return {
            state: completed === results.length ? "completed" : completed > 0 ? "partial_success" : "failed",
            results,
        };
    }
}
//# sourceMappingURL=research.js.map