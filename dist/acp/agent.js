import * as acp from "@agentclientprotocol/sdk";
const modes = {
    currentModeId: "chat",
    availableModes: [
        {
            id: "chat",
            name: "Chat",
            description: "Execute a normal Website conversation turn.",
        },
        {
            id: "research",
            name: "Research",
            description: "Execute provider-native Website research.",
        },
    ],
};
function promptText(prompt) {
    const text = prompt
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    if (text === "")
        throw new Error("Website ACP prompt requires text content");
    return text;
}
function sessionOrThrow(sessions, sessionId) {
    const session = sessions.get(sessionId);
    if (session === undefined)
        throw new Error(`Unknown ACP session: ${sessionId}`);
    return session;
}
export function createInternetAcpAgent(options) {
    const sessions = new Map();
    return acp
        .agent({ name: "internet-website-agent" })
        .onRequest(acp.methods.agent.initialize, () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
        agentCapabilities: {
            loadSession: false,
            promptCapabilities: {
                image: false,
                audio: false,
                embeddedContext: false,
            },
        },
        authMethods: [],
        agentInfo: {
            name: "Internet Website Agent",
            version: "0.0.1",
        },
    }))
        .onRequest(acp.methods.agent.session.new, () => {
        const sessionId = globalThis.crypto.randomUUID();
        sessions.set(sessionId, {
            id: sessionId,
            mode: "chat",
            turn: 0,
        });
        return {
            sessionId,
            modes,
        };
    })
        .onRequest(acp.methods.agent.session.setMode, ({ params }) => {
        const session = sessionOrThrow(sessions, params.sessionId);
        if (params.modeId !== "chat" && params.modeId !== "research") {
            throw new Error(`Unsupported Website ACP mode: ${params.modeId}`);
        }
        session.mode = params.modeId;
        return {};
    })
        .onRequest(acp.methods.agent.session.prompt, async ({ params, client, signal }) => {
        const session = sessionOrThrow(sessions, params.sessionId);
        const controller = new AbortController();
        const onRequestAbort = () => controller.abort(signal.reason);
        if (signal.aborted)
            controller.abort(signal.reason);
        else
            signal.addEventListener("abort", onRequestAbort, { once: true });
        session.active?.abort(new Error("Website ACP session started a replacement turn"));
        session.active = controller;
        session.turn += 1;
        const requestId = `${session.id}:turn:${session.turn}`;
        const prompt = promptText(params.prompt);
        try {
            let text;
            if (session.mode === "research") {
                const result = await options.research.execute({
                    ownerSessionId: session.id,
                    requestId,
                    signal: controller.signal,
                }, {
                    query: prompt,
                    accountIds: options.researchAccountIds,
                });
                text = result.results
                    .filter((item) => item.state === "completed" && item.report !== undefined)
                    .map((item) => item.report)
                    .join("\n\n---\n\n");
            }
            else {
                const result = await options.chat.execute({
                    ownerSessionId: session.id,
                    requestId,
                    signal: controller.signal,
                }, {
                    accountId: options.chatAccountId,
                    prompt,
                });
                text = result.answer;
            }
            if (controller.signal.aborted)
                return { stopReason: "cancelled" };
            if (text !== "") {
                await client.notify(acp.methods.client.session.update, {
                    sessionId: session.id,
                    update: {
                        sessionUpdate: "agent_message_chunk",
                        content: { type: "text", text },
                    },
                });
            }
            return { stopReason: "end_turn" };
        }
        finally {
            signal.removeEventListener("abort", onRequestAbort);
            if (session.active === controller)
                session.active = undefined;
        }
    })
        .onNotification(acp.methods.agent.session.cancel, ({ params }) => {
        sessionOrThrow(sessions, params.sessionId).active?.abort(new Error("ACP session cancelled"));
    });
}
//# sourceMappingURL=agent.js.map