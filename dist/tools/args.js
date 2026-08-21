import { WEB_PROVIDERS } from "#internet/core/config";
/**
 * Validate and normalize the model-facing `browser_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseChatArgs(args) {
    const model = args.model;
    if (typeof model !== "string" || !WEB_PROVIDERS.includes(model)) {
        throw new Error(`browser_chat model must be one of ${WEB_PROVIDERS.join(", ")}`);
    }
    const prompt = args.prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
        throw new Error("browser_chat prompt must be a non-empty string");
    }
    return { provider: model, prompt };
}
//# sourceMappingURL=args.js.map