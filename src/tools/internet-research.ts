import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
import { parseResearchArgs, type ResearchInput } from "#internet/tools/args";

type ResearchAccountResult = {
	accountId: AccountId;
	provider: WebProvider;
	state: "completed" | "failed";
	report?: string;
	url?: string;
	conversationId?: string;
	diagnostic?: string;
};

/** Run provider-native Deep Research with isolated durable account conversations. */
export function defineInternetResearchTool(
	manager: Pick<BrowserManager, "research">,
	config: BrowserConfig,
	allowed: ReadonlySet<AccountId>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_research",
		description:
			"Run provider-native Deep Research using explicitly selected thinker accounts. Research can take up to 30 minutes; each account uses an isolated durable research conversation.",
		parameters: {
			query: { type: "string", required: true, description: "The research question or task." },
			accounts: {
				type: "array",
				items: { type: "string", enum: [...ACCOUNT_IDS] },
				description: "Thinker accounts to research with. Defaults to all enabled thinker accounts.",
			},
			name: { type: "string", description: "Durable research thread name. Defaults to default." },
			visible: { type: "boolean", description: "Show account browsers on the user-managed display." },
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
								accountId: { type: "string", required: true },
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
				const result = value as { results?: ResearchAccountResult[] };
				return [
					{
						type: "text",
						text: (result.results ?? [])
							.map((item) => item.report ?? `${item.accountId}: ${item.diagnostic}`)
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
			results: ResearchAccountResult[];
		}> {
			let input: ResearchInput;
			try {
				input = parseResearchArgs(args);
			} catch {
				return { state: "failed", results: [] };
			}
			const accounts = input.accounts ?? [...allowed];
			if (accounts.some((accountId) => !allowed.has(accountId))) {
				return { state: "failed", results: [] };
			}
			if (exec.agent?.id === undefined) return { state: "failed", results: [] };
			const sessionId = `${String(exec.agent.id)}:research:${input.name ?? "default"}`;
			const results = await Promise.all(
				accounts.map(async (accountId): Promise<ResearchAccountResult> => {
					const provider = getAccountDefinition(accountId).provider;
					try {
						const result = await manager.research(accountId, {
							prompt: input.query,
							sessionId,
							visible: input.visible === true,
							signal: exec.signal,
						});
						return {
							accountId,
							provider,
							state: "completed",
							report: result.text,
							url: result.url,
							conversationId: result.conversationId,
						};
					} catch (error) {
						return {
							accountId,
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
