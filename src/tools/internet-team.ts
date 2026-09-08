import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS, type AccountId } from "#internet/core/accounts";
import type { BrowserConfig } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
import { runTeam, type TeamTurn } from "#internet/team/orchestrator";
import { parseTeamArgs } from "#internet/tools/args";

export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";

type InternetTeamManager = Pick<BrowserManager, "chat">;

interface ProjectedTeamTurn extends TeamTurn {
	/** The original text's omitted portion, if this retained turn was clipped. */
	textTruncation?: "prefix";
}

interface TranscriptProjection {
	transcript: ProjectedTeamTurn[];
	transcriptTruncated: boolean;
}

type InternetTeamOutput = {
	finalAnswer?: unknown;
	error?: unknown;
	transcript?: ProjectedTeamTurn[];
	transcriptTruncated?: unknown;
};

/** Render opt-in transcript data into model-visible tool content, not only UI metadata. */
export function renderInternetTeamResult(value: unknown): string {
	const output = value as InternetTeamOutput;
	const answer = output.finalAnswer !== undefined ? String(output.finalAnswer) : String(output.error ?? value);
	if (output.transcript === undefined) return answer;
	const turns = output.transcript
		.map((turn) => {
			const omitted = turn.textTruncation === "prefix" ? "[Earlier content omitted]\n\n" : "";
			return `### ${turn.accountId} · round ${turn.round}\n${omitted}${turn.text}`;
		})
		.join("\n\n");
	const truncation = output.transcriptTruncated === true ? " (truncated)" : "";
	return `${answer}\n\n---\n\n## Debate transcript${truncation}\n\n${turns}`;
}

/** Retain the newest debate content within the tool's aggregate Unicode code-point budget. */
function projectTranscript(transcript: readonly TeamTurn[], maxChars: number): TranscriptProjection {
	let remaining = maxChars;
	let transcriptTruncated = false;
	const retained: ProjectedTeamTurn[] = [];
	for (let index = transcript.length - 1; index >= 0; index--) {
		const turn = transcript[index];
		if (turn === undefined) continue;
		const text = Array.from(turn.text);
		if (text.length <= remaining) {
			retained.unshift({ ...turn });
			remaining -= text.length;
			continue;
		}
		if (remaining > 0) {
			retained.unshift({ ...turn, text: text.slice(-remaining).join(""), textTruncation: "prefix" });
		}
		transcriptTruncated = true;
		break;
	}
	return { transcript: retained, transcriptTruncated: transcriptTruncated || retained.length !== transcript.length };
}

/** Define the `internet_team` model tool over explicit thinker account identities. */
export function defineInternetTeamTool(
	manager: InternetTeamManager,
	config: BrowserConfig,
	allowed: ReadonlySet<AccountId>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_team",
		description:
			"Run a multi-model debate between authenticated thinker accounts. Final synthesis uses the configured semantic account independently of speaking order. Account browsers are hidden by default; set visible=true to show them.",
		parameters: {
			task: {
				type: "string",
				required: true,
				description: "The task or question for the team to debate.",
			},
			team: {
				type: "string",
				description: "Optional team name; different names get separate durable debate threads.",
			},
			rounds: {
				type: "number",
				description: "Number of debate rounds (each account speaks once per round). Defaults to the plugin config.",
			},
			synthesize: {
				type: "boolean",
				description: "Whether to append a final synthesis turn. Defaults to the plugin config.",
			},
			includeTranscript: {
				type: "boolean",
				description:
					"Include the bounded current-call debate transcript with truncation metadata. Defaults to false.",
			},
			accounts: {
				type: "array",
				items: { type: "string", enum: [...ACCOUNT_IDS] },
				description:
					"Ordered thinker accounts for the debate; the first opens. Defaults to [chatgpt-thinker, gemini-thinker].",
			},
			visible: {
				type: "boolean",
				description: "Show both account browsers on the user-managed display. Defaults to false.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					finalAnswer: { type: "string" },
					finalAccountId: { type: "string" },
					finalProvider: { type: "string" },
					transcript: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								round: { type: "integer", required: true },
								accountId: { type: "string", required: true },
								provider: { type: "string", required: true },
								text: { type: "string", required: true },
								textTruncation: { type: "string", enum: ["prefix"] },
							},
						},
					},
					transcriptTruncated: { type: "boolean" },
					isError: { type: "boolean" },
					error: { type: "string" },
				},
			},
			render: (_args, value) => [{ type: "text", text: renderInternetTeamResult(value) }],
			presentationMeta: (_args, value) => value,
		},
		timeoutMs: config.turnTimeoutMs * (config.teamMaxRounds * allowed.size + 1),
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
			const accounts = input.accounts ?? [...allowed];
			const disabled = accounts.filter((accountId) => !allowed.has(accountId));
			if (disabled.length > 0) {
				return {
					isError: true,
					error: `internet_team accounts ${disabled.join(", ")} are disabled or not thinker accounts.`,
				};
			}
			if (!accounts.includes(config.teamSynthesizer)) {
				return {
					isError: true,
					error: `internet_team synthesizer ${config.teamSynthesizer} must be one of the selected accounts.`,
				};
			}
			const sessionId = exec.agent?.id;
			if (sessionId === undefined) {
				return {
					isError: true,
					error: "internet_team requires an agent-backed DSH session to own the durable team conversations.",
				};
			}
			try {
				const result = await runTeam((accountId, request) => manager.chat(accountId, request), {
					task: input.task,
					sessionId: String(sessionId),
					teamName: input.team,
					rounds,
					synthesize: input.synthesize ?? config.teamSynthesis,
					synthesizer: config.teamSynthesizer,
					accounts,
					visible: input.visible,
					signal: exec.signal,
				});
				const transcript = input.includeTranscript
					? projectTranscript(result.transcript, config.teamTranscriptMaxChars)
					: undefined;
				if ("error" in result) {
					return {
						isError: true,
						error: `${result.error.accountId}: ${result.error.message}`,
						...(transcript === undefined ? {} : transcript),
					};
				}
				return {
					finalAnswer: result.finalAnswer,
					finalAccountId: result.finalAccountId,
					finalProvider: result.finalProvider,
					...(transcript === undefined ? {} : transcript),
				};
			} catch (error) {
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
