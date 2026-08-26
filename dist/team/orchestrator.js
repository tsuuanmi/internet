import { InternetError } from "#internet/core/errors";
const DEFAULT_ROUNDS = 2;
function providerName(provider) {
    return provider === "chatgpt-web" ? "ChatGPT" : "Gemini";
}
function assertNotAborted(signal) {
    if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
    }
}
/**
 * Compose the prompt for one debate turn. The opener (round 1, no prior
 * contribution from the other model) asks for an initial analysis; later turns
 * feed the other model's latest message and ask for critique and refinement.
 * Each model's own history already lives in its native conversation, so only
 * the other model's latest message needs to be injected.
 */
export function composeTurnPrompt(task, provider, otherProvider, otherLatestText, round) {
    const name = providerName(provider);
    const otherName = providerName(otherProvider);
    if (round === 1 && otherLatestText.trim() === "") {
        return [
            `You are ${name} on a two-model team with ${otherName}.`,
            "",
            `Task: ${task}`,
            "",
            "Give your initial analysis and proposed approach. Be concrete and specific.",
        ].join("\n");
    }
    return [
        `You are ${name} on a two-model team with ${otherName}.`,
        "",
        `Task: ${task}`,
        "",
        `${otherName} said:`,
        '"""',
        otherLatestText,
        '"""',
        "",
        `Respond as ${name}: critique, refine, and improve toward the best combined answer.`,
    ].join("\n");
}
/** Compose the final synthesis prompt from the full debate transcript. */
export function composeSynthesisPrompt(task, transcript) {
    const lines = [
        "Here is the full debate on the task. Produce a single final answer that combines the best of both perspectives.",
        "",
        `Task: ${task}`,
        "",
        "Debate:",
    ];
    for (const turn of transcript) {
        lines.push("", `### ${providerName(turn.provider)} (round ${turn.round})`, turn.text);
    }
    lines.push("", "Final answer (best of both):");
    return lines.join("\n");
}
/**
 * Run a two-model debate: the providers alternate for `rounds` rounds, each
 * seeing the other's latest message, then (optionally) the last speaker
 * synthesizes a single final answer from the full transcript. The team uses a
 * derived session key so its conversations are isolated from the agent's own
 * direct `browser_chat` threads yet durable across repeated team calls.
 */
export async function runTeam(chat, options) {
    const rounds = options.rounds ?? DEFAULT_ROUNDS;
    const synthesize = options.synthesize ?? true;
    const startProvider = options.startProvider ?? "chatgpt-web";
    const otherProvider = startProvider === "chatgpt-web" ? "gemini-web" : "chatgpt-web";
    const teamSessionId = `${options.sessionId}:team:${options.teamName ?? "default"}`;
    const transcript = [];
    let lastA = "";
    let lastB = "";
    let lastProvider = startProvider;
    try {
        for (let round = 1; round <= rounds; round++) {
            assertNotAborted(options.signal);
            lastProvider = startProvider;
            const promptA = composeTurnPrompt(options.task, startProvider, otherProvider, lastB, round);
            const resultA = await chat(startProvider, {
                prompt: promptA,
                sessionId: teamSessionId,
                signal: options.signal,
            });
            lastA = resultA.text;
            transcript.push({ round, provider: startProvider, text: resultA.text });
            assertNotAborted(options.signal);
            lastProvider = otherProvider;
            const promptB = composeTurnPrompt(options.task, otherProvider, startProvider, lastA, round);
            const resultB = await chat(otherProvider, {
                prompt: promptB,
                sessionId: teamSessionId,
                signal: options.signal,
            });
            lastB = resultB.text;
            transcript.push({ round, provider: otherProvider, text: resultB.text });
        }
        if (synthesize) {
            assertNotAborted(options.signal);
            const prompt = composeSynthesisPrompt(options.task, transcript);
            const result = await chat(lastProvider, {
                prompt,
                sessionId: teamSessionId,
                signal: options.signal,
            });
            return { finalAnswer: result.text, finalProvider: lastProvider };
        }
        return { finalAnswer: lastB, finalProvider: otherProvider };
    }
    catch (error) {
        return {
            finalAnswer: undefined,
            finalProvider: undefined,
            error: {
                provider: lastProvider,
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
//# sourceMappingURL=orchestrator.js.map