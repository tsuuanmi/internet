import { InternetError } from "#internet/core/errors";
const DEFAULT_ROUNDS = 2;
const DEFAULT_PROVIDERS = ["chatgpt-web", "gemini-web"];
function providerName(provider) {
    if (provider === "chatgpt-web")
        return "ChatGPT";
    if (provider === "gemini-web")
        return "Gemini";
    return provider;
}
/** Join display names with an Oxford comma: "A", "A and B", "A, B, and C". */
export function joinNames(names) {
    if (names.length === 0)
        return "";
    if (names.length === 1)
        return names[0];
    if (names.length === 2)
        return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
function assertNotAborted(signal) {
    if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
    }
}
/**
 * Compose the prompt for one debate turn. The opener (round 1, before any
 * teammate has spoken) asks for an initial analysis; later turns feed every
 * other model's latest message and ask for critique and refinement. Each
 * model's own history already lives in its native conversation, so only the
 * other models' latest messages need to be injected.
 */
export function composeTurnPrompt(task, provider, others, round) {
    const name = providerName(provider);
    const teamLine = `You are ${name} on a team with ${joinNames(others.map((other) => providerName(other.provider)))}.`;
    if (round === 1 && others.every((other) => other.text.trim() === "")) {
        return [
            teamLine,
            "",
            `Task: ${task}`,
            "",
            "Give your initial analysis and proposed approach. Be concrete and specific.",
        ].join("\n");
    }
    const lines = [teamLine, "", `Task: ${task}`, ""];
    for (const other of others) {
        lines.push(`${providerName(other.provider)} said:`, '"""', other.text, '"""', "");
    }
    lines.push(`Respond as ${name}: critique, refine, and improve toward the best combined answer.`);
    return lines.join("\n");
}
/** Compose the final synthesis prompt from the full debate transcript. */
export function composeSynthesisPrompt(task, transcript) {
    const lines = [
        "Here is the full debate on the task. Produce a single final answer that combines the best perspectives.",
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
 * Run a multi-model debate: the providers speak in order each round, each
 * seeing every other model's latest message, then (optionally) the last
 * speaker synthesizes a single final answer from the full transcript. The team
 * uses a derived session key so its conversations are isolated from the
 * agent's own direct `browser_chat` threads yet durable across repeated calls.
 */
export async function runTeam(chat, options) {
    const rounds = options.rounds ?? DEFAULT_ROUNDS;
    const synthesize = options.synthesize ?? true;
    const providers = options.providers ?? DEFAULT_PROVIDERS;
    if (!Number.isInteger(rounds) || rounds <= 0) {
        throw new Error("team debate rounds must be a positive integer");
    }
    if (providers.length < 2) {
        throw new Error("team debate requires at least two providers");
    }
    if (new Set(providers).size !== providers.length) {
        throw new Error("team debate providers must not contain duplicates");
    }
    const teamSessionId = `${options.sessionId}:team:${options.teamName ?? "default"}`;
    const transcript = [];
    const lastByProvider = new Map();
    let lastProvider = providers[0];
    try {
        for (let round = 1; round <= rounds; round++) {
            for (const provider of providers) {
                assertNotAborted(options.signal);
                lastProvider = provider;
                const others = providers
                    .filter((other) => other !== provider)
                    .map((other) => ({ provider: other, text: lastByProvider.get(other) ?? "" }));
                const prompt = composeTurnPrompt(options.task, provider, others, round);
                const result = await chat(provider, {
                    prompt,
                    sessionId: teamSessionId,
                    signal: options.signal,
                });
                lastByProvider.set(provider, result.text);
                transcript.push({ round, provider, text: result.text });
            }
        }
        if (synthesize) {
            assertNotAborted(options.signal);
            const prompt = composeSynthesisPrompt(options.task, transcript);
            const result = await chat(lastProvider, {
                prompt,
                sessionId: teamSessionId,
                signal: options.signal,
            });
            return { finalAnswer: result.text, finalProvider: lastProvider, transcript: [...transcript] };
        }
        const finalAnswer = lastByProvider.get(lastProvider);
        if (finalAnswer === undefined)
            throw new Error("team debate completed without a final turn");
        return { finalAnswer, finalProvider: lastProvider, transcript: [...transcript] };
    }
    catch (error) {
        return {
            error: {
                provider: lastProvider,
                message: error instanceof Error ? error.message : String(error),
            },
            transcript: [...transcript],
        };
    }
}
//# sourceMappingURL=orchestrator.js.map