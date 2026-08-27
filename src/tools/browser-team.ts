import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
import { runTeam, type TeamTurn } from "#internet/team/orchestrator";
import { parseTeamArgs } from "#internet/tools/args";

export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";

type BrowserTeamManager = Pick<BrowserManager, "chat">;

interface ProjectedTeamTurn extends TeamTurn {
	/** The original text's omitted portion, if this retained turn was clipped. */
	textTruncation?: "prefix";
}

interface TranscriptProjection {
	transcript: ProjectedTeamTurn[];
	transcriptTruncated: boolean;
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

/**
 * Define the `browser_team` model tool: run a multi-model debate between the
 * configured web providers on a task and return the final "best of both"
 * answer, optionally accompanied by a bounded current-call transcript. The DSH
 * agent is the team lead and does not participate in the debate.
 */
export function defineBrowserTeamTool(
	manager: BrowserTeamManager,
	config: BrowserConfig,
	allowed: ReadonlySet<WebProvider>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "browser_team",
		description:
			"Run a multi-model debate between configured web providers. Provider browsers are hidden by default; set visible=true to show them on the user-managed display. Returns only the final answer unless includeTranscript is requested.",
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
				description: "Number of debate rounds (each model speaks once per round). Defaults to the plugin config.",
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
			providers: {
				type: "array",
				items: { type: "string", enum: [...WEB_PROVIDERS] },
				description: "Ordered providers for the debate; the first opens. Defaults to [chatgpt-web, gemini-web].",
			},
			visible: {
				type: "boolean",
				description: "Show both provider browsers on the user-managed display. Defaults to false.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					finalAnswer: { type: "string" },
					finalProvider: { type: "string" },
					transcript: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								round: { type: "integer", required: true },
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
			render: (_args, value) => {
				const v = value as { finalAnswer?: unknown; error?: unknown };
				const text = v.finalAnswer !== undefined ? String(v.finalAnswer) : String(v.error ?? value);
				return [{ type: "text", text }];
			},
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
					error: `browser_team rounds must not exceed the configured maximum of ${config.teamMaxRounds}.`,
				};
			}
			if (input.providers !== undefined) {
				const disabled = input.providers.filter((provider) => !allowed.has(provider));
				if (disabled.length > 0) {
					return {
						isError: true,
						error: `browser_team providers ${disabled.join(", ")} are disabled in the internet plugin config.`,
					};
				}
			}
			const sessionId = exec.agent?.id;
			if (sessionId === undefined) {
				return {
					isError: true,
					error: "browser_team requires an agent-backed DSH session to own the durable team conversations.",
				};
			}
			try {
				const result = await runTeam((provider, request) => manager.chat(provider, request), {
					task: input.task,
					sessionId: String(sessionId),
					teamName: input.team,
					rounds,
					synthesize: input.synthesize ?? config.teamSynthesis,
					providers: input.providers,
					visible: input.visible,
					signal: exec.signal,
				});
				const transcript = input.includeTranscript
					? projectTranscript(result.transcript, config.teamTranscriptMaxChars)
					: undefined;
				if ("error" in result) {
					return {
						isError: true,
						error: `${result.error.provider}: ${result.error.message}`,
						...(transcript === undefined ? {} : transcript),
					};
				}
				return {
					finalAnswer: result.finalAnswer,
					finalProvider: result.finalProvider,
					...(transcript === undefined ? {} : transcript),
				};
			} catch (error) {
				if (isInternetError(error)) {
					return { isError: true, error: `browser_team failed (${error.kind}): ${error.message}` };
				}
				throw error;
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `browser_team · ${String(args.task).slice(0, 80)}`,
			kind: "other",
			rawInput: String(args.task),
		}),
	});
}
