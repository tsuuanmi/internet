import { defineTool } from "@deepseek-ai/dsh-tools";
import { parseResearchArgs } from "#internet/tools/args";
/** Thin DSH adapter over the host-neutral provider-native research application service. */
export function defineInternetResearchTool(research, config) {
    return defineTool({
        name: "internet_research",
        description: "Run provider-native Deep Research using explicitly selected thinker accounts. Research can take up to 30 minutes; each account uses an isolated durable research conversation. Completed reports are retained as owner-scoped artifacts.",
        parameters: {
            query: { type: "string", required: true, description: "The research question or task." },
            accounts: {
                type: "array",
                items: { type: "string" },
                description: "Thinker accounts to research with. Defaults to all enabled thinker accounts.",
            },
            name: { type: "string", description: "Durable research thread name. Defaults to default." },
            visible: { type: "boolean", description: "Show account browsers on the user-managed display." },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    state: { type: "string", required: true, enum: ["completed", "partial_success", "failed"] },
                    results: {
                        type: "array",
                        required: true,
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                accountId: { type: "string", required: true },
                                provider: { type: "string", required: true },
                                state: { type: "string", required: true },
                                report: { type: "string" },
                                url: { type: "string" },
                                conversationId: { type: "string" },
                                artifactId: { type: "string" },
                                totalChars: { type: "integer" },
                                truncated: { type: "boolean" },
                                nextOffset: { type: "integer" },
                                diagnostic: { type: "string" },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => {
                const result = value;
                return [
                    {
                        type: "text",
                        text: (result.results ?? [])
                            .map((item) => item.report ?? `${item.accountId}: ${item.diagnostic}`)
                            .join("\n\n---\n\n"),
                    },
                ];
            },
            presentationMeta: (_args, value) => value,
        },
        timeoutMs: config.researchTimeoutMs,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            let input;
            try {
                input = parseResearchArgs(args);
            }
            catch {
                return { state: "failed", results: [] };
            }
            if (exec.agent?.id === undefined)
                return { state: "failed", results: [] };
            return research.execute({
                ownerSessionId: String(exec.agent.id),
                requestId: String(exec.callId),
                signal: exec.signal,
            }, {
                query: input.query,
                ...(input.accounts === undefined ? {} : { accountIds: input.accounts }),
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.visible === undefined ? {} : { visible: input.visible }),
            });
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_research · ${String(args.query).slice(0, 80)}`,
            kind: "other",
        }),
    });
}
//# sourceMappingURL=internet-research.js.map