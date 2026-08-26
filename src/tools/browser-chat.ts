import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
import { parseChatArgs } from "#internet/tools/args";

export type { ChatInput } from "#internet/tools/args";
export { parseChatArgs } from "#internet/tools/args";

/**
 * Define the `browser_chat` model tool: ask ChatGPT Web or Gemini Web a
 * question through a real logged-in browser and return the rendered answer as
 * markdown. This is the MVP entry point that DSH agents call; a provider-model
 * adapter on `ctx.llm` can be layered on later reusing the same
 * {@link BrowserManager}.
 */
export function defineBrowserChatTool(
	manager: BrowserManager,
	timeoutMs: number,
	allowed: ReadonlySet<WebProvider>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "browser_chat",
		description:
			"Ask ChatGPT or Gemini through a logged-in browser. Both ChatGPT and Gemini durably resume one native conversation per current DSH session. Use when you specifically need a web-model response or want multiple turns in the same conversation.",
		parameters: {
			model: {
				type: "string",
				required: true,
				enum: [...WEB_PROVIDERS],
				description: "Which web model to call.",
			},
			prompt: {
				type: "string",
				required: true,
				description: "The question or instruction for the web model.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					answer: { type: "string", required: true },
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
			const { provider, prompt } = parseChatArgs(args);
			if (!allowed.has(provider)) {
				return {
					answer: `browser_chat provider ${provider} is disabled in the internet plugin config.`,
					provider,
					isError: true,
				};
			}
			const sessionId = exec.agent?.id;
			if (sessionId === undefined) {
				return {
					answer: "browser_chat requires an agent-backed DSH session to own the durable web conversation.",
					provider,
					isError: true,
				};
			}
			try {
				const result = await manager.chat(provider, {
					prompt,
					sessionId: String(sessionId),
					signal: exec.signal,
				});
				return {
					answer: result.text,
					provider,
					url: result.url,
					...(result.conversationId === undefined ? {} : { conversationId: result.conversationId }),
				};
			} catch (error) {
				if (isInternetError(error)) {
					return {
						answer: `browser_chat failed (${error.kind}): ${error.message}`,
						provider,
						isError: true,
					};
				}
				throw error;
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `${String(args.model)} · ${String(args.prompt).slice(0, 80)}`,
			kind: "other",
			rawInput: String(args.prompt),
		}),
	});
}
