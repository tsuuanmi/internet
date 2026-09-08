import { getAccountDefinition } from "#internet/core/accounts";
import { InternetError } from "#internet/core/errors";
const DEFAULT_ROUNDS = 2;
const DEFAULT_ACCOUNTS = ["chatgpt-thinker", "gemini-thinker"];
const DEFAULT_SYNTHESIZER = "chatgpt-thinker";
function accountName(accountId) {
    if (accountId === "chatgpt-thinker")
        return "ChatGPT";
    if (accountId === "gemini-thinker")
        return "Gemini";
    return accountId;
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
/** Compose the prompt for one debate turn. */
export function composeTurnPrompt(task, accountId, others, round) {
    const name = accountName(accountId);
    const teamLine = `You are ${name} on a team with ${joinNames(others.map((other) => accountName(other.accountId)))}.`;
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
        lines.push(`${accountName(other.accountId)} said:`, '"""', other.text, '"""', "");
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
        lines.push("", `### ${accountName(turn.accountId)} (round ${turn.round})`, turn.text);
    }
    lines.push("", "Final answer (best of both):");
    return lines.join("\n");
}
/**
 * Run a multi-model debate using an exact durable conversation-session key.
 * Callers own namespace construction; this primitive does not append hidden
 * provider/tool-specific suffixes.
 */
export async function runTeam(chat, options) {
    const rounds = options.rounds ?? DEFAULT_ROUNDS;
    const synthesize = options.synthesize ?? true;
    const synthesizer = options.synthesizer ?? DEFAULT_SYNTHESIZER;
    const accounts = options.accounts ?? DEFAULT_ACCOUNTS;
    if (!Number.isInteger(rounds) || rounds <= 0)
        throw new Error("team debate rounds must be a positive integer");
    if (accounts.length < 2)
        throw new Error("team debate requires at least two accounts");
    if (new Set(accounts).size !== accounts.length)
        throw new Error("team debate accounts must not contain duplicates");
    if (synthesize && !accounts.includes(synthesizer))
        throw new Error("team synthesizer must be one of the selected accounts");
    if (options.sessionId.trim() === "")
        throw new Error("team debate sessionId must not be empty");
    const transcript = [];
    const lastByAccount = new Map();
    let activeAccountId = accounts[0];
    let finalDebateAccountId = accounts[0];
    try {
        for (let round = 1; round <= rounds; round++) {
            for (const accountId of accounts) {
                assertNotAborted(options.signal);
                activeAccountId = accountId;
                finalDebateAccountId = accountId;
                const others = accounts
                    .filter((other) => other !== accountId)
                    .map((other) => ({
                    accountId: other,
                    provider: getAccountDefinition(other).provider,
                    text: lastByAccount.get(other) ?? "",
                }));
                const prompt = composeTurnPrompt(options.task, accountId, others, round);
                const result = await chat(accountId, {
                    prompt,
                    sessionId: options.sessionId,
                    visible: options.visible,
                    signal: options.signal,
                });
                lastByAccount.set(accountId, result.text);
                transcript.push({
                    round,
                    accountId,
                    provider: getAccountDefinition(accountId).provider,
                    text: result.text,
                });
            }
        }
        if (synthesize) {
            assertNotAborted(options.signal);
            activeAccountId = synthesizer;
            const prompt = composeSynthesisPrompt(options.task, transcript);
            const result = await chat(synthesizer, {
                prompt,
                sessionId: options.sessionId,
                visible: options.visible,
                signal: options.signal,
            });
            return {
                finalAnswer: result.text,
                finalAccountId: synthesizer,
                finalProvider: getAccountDefinition(synthesizer).provider,
                transcript: [...transcript],
            };
        }
        const finalAnswer = lastByAccount.get(finalDebateAccountId);
        if (finalAnswer === undefined)
            throw new Error("team debate completed without a final turn");
        return {
            finalAnswer,
            finalAccountId: finalDebateAccountId,
            finalProvider: getAccountDefinition(finalDebateAccountId).provider,
            transcript: [...transcript],
        };
    }
    catch (error) {
        return {
            error: {
                accountId: activeAccountId,
                provider: getAccountDefinition(activeAccountId).provider,
                message: error instanceof Error ? error.message : String(error),
            },
            transcript: [...transcript],
        };
    }
}
//# sourceMappingURL=orchestrator.js.map