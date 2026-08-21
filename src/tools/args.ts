import type { WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";

/** Validated `browser_chat` arguments. */
export interface ChatInput {
	provider: WebProvider;
	prompt: string;
}

/**
 * Validate and normalize the model-facing `browser_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseChatArgs(args: Record<string, unknown>): ChatInput {
	const model = args.model;
	if (typeof model !== "string" || !(WEB_PROVIDERS as readonly string[]).includes(model)) {
		throw new Error(`browser_chat model must be one of ${WEB_PROVIDERS.join(", ")}`);
	}
	const prompt = args.prompt;
	if (typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new Error("browser_chat prompt must be a non-empty string");
	}
	return { provider: model as WebProvider, prompt };
}
