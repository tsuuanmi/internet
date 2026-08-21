import type { WebProvider } from "#internet/core/config";
/** Validated `browser_chat` arguments. */
export interface ChatInput {
    provider: WebProvider;
    prompt: string;
}
/**
 * Validate and normalize the model-facing `browser_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export declare function parseChatArgs(args: Record<string, unknown>): ChatInput;
//# sourceMappingURL=args.d.ts.map