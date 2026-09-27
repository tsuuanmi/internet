import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_IDS, getAccountDefinition } from "#internet/core/accounts";
import { parseChatArgs } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";
/** Define the DSH adapter for host-neutral `internet_chat` application behavior. */
export function defineInternetChatTool(application, timeoutMs) {
    return defineTool({
        name: "internet_chat",
        description: "Ask an explicitly selected authenticated web account. Thinker accounts durably resume one native conversation per current DSH session. Completed calls are retained as owner-scoped artifacts; long answers are compacted and can be continued with internet_artifact.",
        parameters: {
            account: {
                type: "string",
                required: true,
                enum: [...ACCOUNT_IDS],
                description: "Semantic authenticated account to call.",
            },
            prompt: {
                type: "string",
                required: true,
                description: "The question or instruction for the web model.",
            },
            visible: {
                type: "boolean",
                description: "Show the automated browser on the user-managed display. Defaults to false.",
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    answer: { type: "string", required: true },
                    accountId: { type: "string", required: true },
                    provider: { type: "string", required: true },
                    url: { type: "string" },
                    conversationId: { type: "string" },
                    artifactId: { type: "string" },
                    totalChars: { type: "integer" },
                    truncated: { type: "boolean" },
                    nextOffset: { type: "integer" },
                    isError: { type: "boolean" },
                },
            },
            render: (_args, value) => [{ type: "text", text: String(value?.answer ?? value) }],
            presentationMeta: (_args, value) => value,
        },
        timeoutMs,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const input = parseChatArgs(args);
            const provider = getAccountDefinition(input.accountId).provider;
            const sessionId = exec.agent?.id;
            if (sessionId === undefined) {
                return {
                    answer: "internet_chat requires an agent-backed DSH session to own the durable web conversation.",
                    accountId: input.accountId,
                    provider,
                    isError: true,
                };
            }
            return application.execute({
                ownerSessionId: String(sessionId),
                requestId: String(exec.callId),
                signal: exec.signal,
            }, input);
        },
        presentCall: (args) => ({
            card: "generic",
            title: `${String(args.account)} · ${String(args.prompt).slice(0, 80)}`,
            kind: "other",
            rawInput: String(args.prompt),
        }),
    });
}
//# sourceMappingURL=internet-chat.js.map