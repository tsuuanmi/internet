import type { WebProvider } from "#internet/core/config";
import { WEB_PROVIDERS } from "#internet/core/config";

/** Validated `internet_chat` arguments. */
export interface ChatInput {
	provider: WebProvider;
	prompt: string;
	visible?: boolean;
}

/**
 * Validate and normalize the model-facing `internet_chat` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseChatArgs(args: Record<string, unknown>): ChatInput {
	const model = args.model;
	if (typeof model !== "string" || !(WEB_PROVIDERS as readonly string[]).includes(model)) {
		throw new Error(`internet_chat model must be one of ${WEB_PROVIDERS.join(", ")}`);
	}
	const prompt = args.prompt;
	if (typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new Error("internet_chat prompt must be a non-empty string");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_chat visible must be a boolean");
	}
	return { provider: model as WebProvider, prompt, ...(visible === undefined ? {} : { visible }) };
}

/** Validated `internet_research` arguments. */
export interface ResearchInput {
	query: string;
	name?: string;
	providers?: WebProvider[];
	visible?: boolean;
}

/** Validate research arguments without coupling the parser to DSH packages. */
export function parseResearchArgs(args: Record<string, unknown>): ResearchInput {
	const query = args.query;
	if (typeof query !== "string" || query.trim().length === 0) {
		throw new Error("internet_research query must be a non-empty string");
	}
	const name = args.name;
	if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
		throw new Error("internet_research name must be a non-empty string");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_research visible must be a boolean");
	}
	const providers = args.providers;
	if (providers !== undefined) {
		if (!Array.isArray(providers) || providers.length === 0) {
			throw new Error("internet_research providers must be a non-empty array");
		}
		const seen = new Set<string>();
		for (const value of providers) {
			if (typeof value !== "string" || !(WEB_PROVIDERS as readonly string[]).includes(value)) {
				throw new Error(`internet_research providers must be one of ${WEB_PROVIDERS.join(", ")}`);
			}
			if (seen.has(value)) throw new Error("internet_research providers must not contain duplicates");
			seen.add(value);
		}
	}
	return {
		query,
		...(name === undefined ? {} : { name }),
		...(providers === undefined ? {} : { providers: providers as WebProvider[] }),
		...(visible === undefined ? {} : { visible }),
	};
}

/** Validated `internet_team` arguments. */
export interface TeamInput {
	task: string;
	team?: string;
	rounds?: number;
	synthesize?: boolean;
	includeTranscript?: boolean;
	providers?: WebProvider[];
	visible?: boolean;
}

/**
 * Validate and normalize the model-facing `internet_team` arguments. Kept free
 * of any DeepSeek Harness import so it is unit-testable without DSH packages.
 */
export function parseTeamArgs(args: Record<string, unknown>): TeamInput {
	const task = args.task;
	if (typeof task !== "string" || task.trim().length === 0) {
		throw new Error("internet_team task must be a non-empty string");
	}
	const team = args.team;
	if (team !== undefined && (typeof team !== "string" || team.trim().length === 0)) {
		throw new Error("internet_team team must be a non-empty string");
	}
	const rounds = args.rounds;
	if (rounds !== undefined && (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds <= 0)) {
		throw new Error("internet_team rounds must be a positive integer");
	}
	const synthesize = args.synthesize;
	if (synthesize !== undefined && typeof synthesize !== "boolean") {
		throw new Error("internet_team synthesize must be a boolean");
	}
	const includeTranscript = args.includeTranscript;
	if (includeTranscript !== undefined && typeof includeTranscript !== "boolean") {
		throw new Error("internet_team includeTranscript must be a boolean");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_team visible must be a boolean");
	}
	const providers = args.providers;
	if (providers !== undefined) {
		if (!Array.isArray(providers) || providers.length < 2) {
			throw new Error("internet_team providers must be an array of at least two providers");
		}
		const seen = new Set<string>();
		for (const value of providers) {
			if (typeof value !== "string" || !(WEB_PROVIDERS as readonly string[]).includes(value)) {
				throw new Error(`internet_team providers must be one of ${WEB_PROVIDERS.join(", ")}`);
			}
			if (seen.has(value)) {
				throw new Error("internet_team providers must not contain duplicates");
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
		...(providers === undefined ? {} : { providers: providers as WebProvider[] }),
		...(visible === undefined ? {} : { visible }),
	};
}
