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

/** Validated `browser_team` arguments. */
export interface TeamInput {
	task: string;
	team?: string;
	rounds?: number;
	synthesize?: boolean;
	providers?: WebProvider[];
}

/**
 * Validate and normalize the model-facing `browser_team` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseTeamArgs(args: Record<string, unknown>): TeamInput {
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
	const providers = args.providers;
	if (providers !== undefined) {
		if (!Array.isArray(providers) || providers.length < 2) {
			throw new Error("browser_team providers must be an array of at least two providers");
		}
		const seen = new Set<string>();
		for (const value of providers) {
			if (typeof value !== "string" || !(WEB_PROVIDERS as readonly string[]).includes(value)) {
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
		...(providers === undefined ? {} : { providers: providers as WebProvider[] }),
	};
}
