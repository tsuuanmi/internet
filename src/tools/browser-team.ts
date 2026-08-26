import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
import { runTeam } from "#internet/team/orchestrator";
import { parseTeamArgs } from "#internet/tools/args";

export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";

/**
 * Define the `browser_team` model tool: run a two-model debate between ChatGPT
 * Web and Gemini Web on a task and return only the final "best of both" answer.
 * The DSH agent is the team lead — it calls this tool and receives the answer
 * without participating in the debate.
 */
export function defineBrowserTeamTool(
	manager: BrowserManager,
	config: BrowserConfig,
	allowed: ReadonlySet<WebProvider>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "browser_team",
		description:
			"Run a two-model debate between ChatGPT and Gemini on a task. The two models alternate for `rounds` rounds, each critiquing and refining the other's latest message, then produce a single final 'best of both' answer. Returns only the final answer. Use when the user wants a multi-model brainstorm, debate, or second opinion.",
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
			startProvider: {
				type: "string",
				enum: [...WEB_PROVIDERS],
				description: "Which model opens the debate. Defaults to chatgpt-web.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					finalAnswer: { type: "string" },
					finalProvider: { type: "string" },
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
		timeoutMs: config.turnTimeoutMs * (config.teamRounds * 2 + 1),
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const input = parseTeamArgs(args);
			if (input.startProvider !== undefined && !allowed.has(input.startProvider)) {
				return {
					isError: true,
					error: `browser_team startProvider ${input.startProvider} is disabled in the internet plugin config.`,
				};
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
					rounds: input.rounds ?? config.teamRounds,
					synthesize: input.synthesize ?? config.teamSynthesis,
					startProvider: input.startProvider,
					signal: exec.signal,
				});
				if (result.error !== undefined) {
					return { isError: true, error: `${result.error.provider}: ${result.error.message}` };
				}
				return {
					finalAnswer: result.finalAnswer,
					...(result.finalProvider === undefined ? {} : { finalProvider: result.finalProvider }),
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
			kind: "chat",
			rawInput: String(args.task),
		}),
	});
}
