import { isInternetError } from "#internet/core/errors";
const USAGE = "Usage: /internet <question>";
/** Define the human-facing `/internet` command backed by ChatGPT Web. */
export function defineInternetCommand(manager) {
    return {
        name: "internet",
        description: "ask ChatGPT through the browser",
        input: { hint: "<question>" },
        async handler(invocation) {
            const prompt = invocation.rawInput.trim();
            if (prompt.length === 0) {
                return { kind: "error", text: `A question is required. ${USAGE}` };
            }
            try {
                const result = await manager.chat("chatgpt-web", {
                    prompt,
                    sessionId: String(invocation.agent.id),
                    signal: invocation.signal,
                });
                return { kind: "success", text: result.text };
            }
            catch (error) {
                if (isInternetError(error)) {
                    return { kind: "error", text: `/internet failed (${error.kind}): ${error.message}` };
                }
                throw error;
            }
        },
    };
}
//# sourceMappingURL=internet.js.map