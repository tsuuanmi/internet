import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_IDS, DEFAULT_TEAM_ACCOUNTS } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
import { runTeam } from "#internet/team/orchestrator";
import { parseTeamArgs } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";
function memberNumber(members, accountId) {
    const index = members.indexOf(accountId);
    if (index < 0)
        throw new Error(`team account ${accountId} is not in the selected team`);
    return index + 1;
}
/** Render opt-in transcript data using provider-agnostic member identities. */
export function renderInternetTeamResult(value) {
    const output = value;
    const answer = output.finalAnswer !== undefined ? String(output.finalAnswer) : String(output.error ?? value);
    if (output.transcript === undefined)
        return answer;
    const turns = output.transcript
        .map((turn) => {
        const omitted = turn.textTruncation === "prefix" ? "[Earlier content omitted]\n\n" : "";
        return `### Member ${turn.member} · round ${turn.round}\n${omitted}${turn.text}`;
    })
        .join("\n\n");
    const truncation = output.transcriptTruncated === true ? " (truncated)" : "";
    return `${answer}\n\n---\n\n## Team transcript${truncation}\n\n${turns}`;
}
/** Retain the newest debate content within the tool's aggregate Unicode code-point budget. */
function projectTranscript(transcript, members, maxChars) {
    let remaining = maxChars;
    let transcriptTruncated = false;
    const retained = [];
    for (let index = transcript.length - 1; index >= 0; index--) {
        const turn = transcript[index];
        if (turn === undefined)
            continue;
        const text = Array.from(turn.text);
        const base = { round: turn.round, member: memberNumber(members, turn.accountId) };
        if (text.length <= remaining) {
            retained.unshift({ ...base, text: turn.text });
            remaining -= text.length;
            continue;
        }
        if (remaining > 0) {
            retained.unshift({
                ...base,
                text: text.slice(-remaining).join(""),
                textTruncation: "prefix",
            });
        }
        transcriptTruncated = true;
        break;
    }
    return { transcript: retained, transcriptTruncated: transcriptTruncated || retained.length !== transcript.length };
}
/** Define the provider-agnostic `internet_team` tool over authenticated thinker members. */
export function defineInternetTeamTool(manager, config, allowed) {
    return defineTool({
        name: "internet_team",
        description: "Run a provider-agnostic agent-team debate between authenticated thinker members. Members are addressed only as Member 1..N; final synthesis selects the strongest supported combined answer. Account browsers are hidden by default; set visible=true to show them.",
        parameters: {
            task: { type: "string", required: true, description: "The task or question for the team to debate." },
            team: {
                type: "string",
                description: "Optional team name; different names get separate durable team threads.",
            },
            rounds: {
                type: "number",
                description: "Number of rounds (each member speaks once per round). Defaults to the plugin config.",
            },
            synthesize: {
                type: "boolean",
                description: "Whether to append a final synthesis turn. Defaults to the plugin config.",
            },
            includeTranscript: {
                type: "boolean",
                description: "Include the bounded current-call team transcript. Members are shown as Member 1..N.",
            },
            accounts: {
                type: "array",
                items: { type: "string", enum: [...ACCOUNT_IDS] },
                description: "Ordered authenticated thinker accounts backing Member 1..N. Defaults to two independent ChatGPT thinker accounts; provider identity is not exposed to members.",
            },
            visible: {
                type: "boolean",
                description: "Show selected member browsers on the user-managed display. Defaults to false.",
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    finalAnswer: { type: "string" },
                    finalMember: { type: "integer" },
                    transcript: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                round: { type: "integer", required: true },
                                member: { type: "integer", required: true },
                                text: { type: "string", required: true },
                                textTruncation: { type: "string", enum: ["prefix"] },
                            },
                        },
                    },
                    transcriptTruncated: { type: "boolean" },
                    isError: { type: "boolean" },
                    error: { type: "string" },
                    diagnostic: { type: "string" },
                },
            },
            render: (_args, value) => [{ type: "text", text: renderInternetTeamResult(value) }],
            presentationMeta: (_args, value) => value,
        },
        timeoutMs: config.turnTimeoutMs * (config.teamMaxRounds * Math.max(DEFAULT_TEAM_ACCOUNTS.length, allowed.size) + 1),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const input = parseTeamArgs(args);
            const rounds = input.rounds ?? config.teamRounds;
            if (rounds > config.teamMaxRounds) {
                return {
                    isError: true,
                    error: `internet_team rounds must not exceed the configured maximum of ${config.teamMaxRounds}.`,
                };
            }
            const accounts = input.accounts ?? [...DEFAULT_TEAM_ACCOUNTS];
            const disabled = accounts.filter((accountId) => !allowed.has(accountId));
            if (disabled.length > 0) {
                return {
                    isError: true,
                    error: `internet_team selected member account(s) are unavailable: ${disabled.join(", ")}.`,
                };
            }
            if (!accounts.includes(config.teamSynthesizer)) {
                return {
                    isError: true,
                    error: `internet_team synthesizer ${config.teamSynthesizer} must back one of the selected members.`,
                };
            }
            const ownerSessionId = exec.agent?.id;
            if (ownerSessionId === undefined) {
                return {
                    isError: true,
                    error: "internet_team requires an agent-backed DSH session to own the durable team conversations.",
                };
            }
            try {
                const result = await runTeam((accountId, request) => manager.chat(accountId, request), {
                    task: input.task,
                    sessionId: `${String(ownerSessionId)}:team:${input.team ?? "default"}`,
                    rounds,
                    synthesize: input.synthesize ?? config.teamSynthesis,
                    synthesizer: config.teamSynthesizer,
                    accounts,
                    visible: input.visible,
                    signal: exec.signal,
                });
                const transcript = input.includeTranscript
                    ? projectTranscript(result.transcript, accounts, config.teamTranscriptMaxChars)
                    : undefined;
                if ("error" in result) {
                    return {
                        isError: true,
                        error: `Member ${memberNumber(accounts, result.error.accountId)} failed: ${result.error.message}`,
                        diagnostic: `${result.error.accountId} · ${result.error.provider} · ${result.error.kind}`,
                        ...(transcript === undefined ? {} : transcript),
                    };
                }
                return {
                    finalAnswer: result.finalAnswer,
                    finalMember: memberNumber(accounts, result.finalAccountId),
                    ...(transcript === undefined ? {} : transcript),
                };
            }
            catch (error) {
                if (isInternetError(error)) {
                    return { isError: true, error: `internet_team failed (${error.kind}): ${error.message}` };
                }
                throw error;
            }
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_team · ${String(args.task).slice(0, 80)}`,
            kind: "other",
            rawInput: String(args.task),
        }),
    });
}
//# sourceMappingURL=internet-team.js.map