import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
import {
	projectWebsiteParticipantResult,
	type WebsiteParticipantService,
} from "#internet/participant/service";
import { parseChatArgs } from "#internet/tools/args";

export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";

/** Define the `internet_chat` model tool over explicitly selected thinker accounts. */
export function defineInternetChatTool(
	participant: Pick<WebsiteParticipantService, "execute">,
	timeoutMs: number,
	allowed: ReadonlySet<AccountId>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_chat",
		description:
			"Ask an explicitly selected authenticated web account. Thinker accounts durably resume one native conversation per current DSH session. Completed calls are retained as owner-scoped artifacts; long answers are compacted and can be continued with internet_artifact.",
		parameters: {
			account: {
				type: "string",
				required: true,
				enum: [...ACCOUNT_IDS],
				description: "Semantic authenticated account to call.",
			},
			prompt: {
				type: "string",
				required: true,
				description: "The question or instruction for the web model.",
			},
			visible: {
				type: "boolean",
				description: "Show the automated browser on the user-managed display. Defaults to false.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					answer: { type: "string", required: true },
					accountId: { type: "string", required: true },
					provider: { type: "string", required: true },
					url: { type: "string" },
					conversationId: { type: "string" },
					artifactId: { type: "string" },
					totalChars: { type: "integer" },
					truncated: { type: "boolean" },
					nextOffset: { type: "integer" },
					isError: { type: "boolean" },
				},
			},
			render: (_args, value) => [{ type: "text", text: String((value as { answer?: unknown })?.answer ?? value) }],
			presentationMeta: (_args, value) => value,
		},
		timeoutMs,
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const { accountId, prompt, visible } = parseChatArgs(args);
			const provider = getAccountDefinition(accountId).provider;
			if (!allowed.has(accountId)) {
				return {
					answer: `internet_chat account ${accountId} is not enabled for direct thinker chat.`,
					accountId,
					provider,
					isError: true,
				};
			}
			const sessionId = exec.agent?.id;
			if (sessionId === undefined) {
				return {
					answer: "internet_chat requires an agent-backed DSH session to own the durable web conversation.",
					accountId,
					provider,
					isError: true,
				};
			}
			try {
				const result = await participant.execute({
					ownerSessionId: String(sessionId),
					accountId,
					logicalRequestId: String(exec.callId),
					mode: "chat",
					prompt,
					visible,
					signal: exec.signal,
				});
				const projection = projectWebsiteParticipantResult(result);
				return {
					answer: projection.text,
					accountId,
					provider,
					url: result.url,
					...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
					artifactId: projection.artifactId,
					totalChars: projection.totalChars,
					truncated: projection.truncated,
					...(projection.nextOffset === undefined ? {} : { nextOffset: projection.nextOffset }),
				};
			} catch (error) {
				if (isInternetError(error)) {
					return {
						answer: `internet_chat failed (${error.kind}): ${error.message}`,
						accountId,
						provider,
						isError: true,
					};
				}
				throw error;
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `${String(args.account)} · ${String(args.prompt).slice(0, 80)}`,
			kind: "other",
			rawInput: String(args.prompt),
		}),
	});
}
