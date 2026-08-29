import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";

type ResearchProviderResult = {
	provider: WebProvider;
	state: "completed" | "failed";
	report?: string;
	url?: string;
	conversationId?: string;
	diagnostic?: string;
};

/** Run provider-native Deep Research with isolated durable conversations. */
export function defineInternetResearchTool(
	manager: Pick<BrowserManager, "research">,
	config: BrowserConfig,
	allowed: ReadonlySet<WebProvider>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_research",
		description:
			"Run provider-native Deep Research in ChatGPT and/or Gemini. Research can take up to 30 minutes; each provider uses an isolated durable research conversation.",
		parameters: {
			query: { type: "string", required: true, description: "The research question or task." },
			providers: {
				type: "array",
				items: { type: "string", enum: [...WEB_PROVIDERS] },
				description: "Providers to research with. Defaults to both enabled providers.",
			},
			name: { type: "string", description: "Durable research thread name. Defaults to default." },
			visible: { type: "boolean", description: "Show provider browsers on the user-managed display." },
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					state: { type: "string", required: true, enum: ["completed", "partial_success", "failed"] },
					results: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								provider: { type: "string", required: true },
								state: { type: "string", required: true },
								report: { type: "string" },
								url: { type: "string" },
								conversationId: { type: "string" },
								diagnostic: { type: "string" },
							},
						},
					},
				},
			},
			render: (_args, value) => {
				const result = value as { results?: ResearchProviderResult[] };
				return [
					{
						type: "text",
						text: (result.results ?? [])
							.map((item) => item.report ?? `${item.provider}: ${item.diagnostic}`)
							.join("\n\n---\n\n"),
					},
				];
			},
			presentationMeta: (_args, value) => value,
		},
		timeoutMs: config.researchTimeoutMs,
		isConcurrencySafe: () => false,
		async execute(
			args,
			exec,
		): Promise<{
			state: "completed" | "partial_success" | "failed";
			results: ResearchProviderResult[];
		}> {
			if (typeof args.query !== "string" || args.query.trim().length === 0) {
				return { state: "failed", results: [] };
			}
			const selected = args.providers === undefined ? [...allowed] : args.providers;
			if (!Array.isArray(selected) || selected.length === 0 || selected.some((value) => typeof value !== "string")) {
				return { state: "failed", results: [] };
			}
			const providers = [...new Set(selected)] as WebProvider[];
			if (
				providers.some(
					(provider) => !(WEB_PROVIDERS as readonly string[]).includes(provider) || !allowed.has(provider),
				)
			) {
				return { state: "failed", results: [] };
			}
			if (args.name !== undefined && (typeof args.name !== "string" || args.name.trim().length === 0)) {
				return { state: "failed", results: [] };
			}
			if (args.visible !== undefined && typeof args.visible !== "boolean") return { state: "failed", results: [] };
			if (exec.agent?.id === undefined) return { state: "failed", results: [] };
			const sessionId = `${String(exec.agent.id)}:research:${typeof args.name === "string" ? args.name : "default"}`;
			const results = await Promise.all(
				providers.map(async (provider): Promise<ResearchProviderResult> => {
					try {
						const result = await manager.research(provider, {
							prompt: args.query,
							sessionId,
							visible: args.visible === true,
							signal: exec.signal,
						});
						return {
							provider,
							state: "completed",
							report: result.text,
							url: result.url,
							conversationId: result.conversationId,
						};
					} catch (error) {
						return {
							provider,
							state: "failed",
							diagnostic: isInternetError(error) ? `${error.kind}: ${error.message}` : String(error),
						};
					}
				}),
			);
			const completed = results.filter((result) => result.state === "completed").length;
			return {
				state: completed === results.length ? "completed" : completed > 0 ? "partial_success" : "failed",
				results,
			};
		},
		presentCall: (args) => ({
			card: "generic",
			title: `internet_research · ${String(args.query).slice(0, 80)}`,
			kind: "other",
		}),
	});
}
