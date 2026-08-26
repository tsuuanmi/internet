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
/**
 * Validate and normalize the model-facing `browser_team` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseTeamArgs(args) {
    const task = args.task;
    if (typeof task !== "string" || task.trim().length === 0) {
        throw new Error("browser_team task must be a non-empty string");
    }
    const team = args.team;
    if (team !== undefined && (typeof team !== "string" || team.trim().length === 0)) {
        throw new Error("browser_team team must be a non-empty string");
    }
    const rounds = args.rounds;
    if (rounds !== undefined && (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds <= 0)) {
        throw new Error("browser_team rounds must be a positive integer");
    }
    const synthesize = args.synthesize;
    if (synthesize !== undefined && typeof synthesize !== "boolean") {
        throw new Error("browser_team synthesize must be a boolean");
    }
    const includeTranscript = args.includeTranscript;
    if (includeTranscript !== undefined && typeof includeTranscript !== "boolean") {
        throw new Error("browser_team includeTranscript must be a boolean");
    }
    const providers = args.providers;
    if (providers !== undefined) {
        if (!Array.isArray(providers) || providers.length < 2) {
            throw new Error("browser_team providers must be an array of at least two providers");
        }
        const seen = new Set();
        for (const value of providers) {
            if (typeof value !== "string" || !WEB_PROVIDERS.includes(value)) {
                throw new Error(`browser_team providers must be one of ${WEB_PROVIDERS.join(", ")}`);
            }
            if (seen.has(value)) {
                throw new Error("browser_team providers must not contain duplicates");
            }
            seen.add(value);
        }
    }
    return {
        task,
        ...(team === undefined ? {} : { team }),
        ...(rounds === undefined ? {} : { rounds }),
        ...(synthesize === undefined ? {} : { synthesize }),
        ...(includeTranscript === undefined ? {} : { includeTranscript }),
        ...(providers === undefined ? {} : { providers: providers }),
    };
}
//# sourceMappingURL=args.js.map