import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
import { parseChatArgs } from "#internet/tools/args";

export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";

/** Define the `internet_chat` model tool over explicitly selected thinker accounts. */
export function defineInternetChatTool(
	manager: BrowserManager,
	timeoutMs: number,
	allowed: ReadonlySet<AccountId>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_chat",
		description:
			"Ask an explicitly selected authenticated web account. Thinker accounts durably resume one native conversation per current DSH session. The browser is hidden by default; set visible=true to show it on the user-managed display.",
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
				const result = await manager.chat(accountId, {
					prompt,
					sessionId: String(sessionId),
					visible,
					signal: exec.signal,
				});
				return {
					answer: result.text,
					accountId,
					provider,
					url: result.url,
					...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
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
