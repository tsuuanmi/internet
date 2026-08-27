import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";

/** One completed contribution in a team debate. */
export interface TeamTurn {
	round: number;
	provider: WebProvider;
	text: string;
}

/** A teammate's latest message, shown to the current speaker. */
export interface OtherContribution {
	provider: WebProvider;
	text: string;
}

/** Successful result of a team debate. */
export interface TeamSuccess {
	finalAnswer: string;
	finalProvider: WebProvider;
	/** Completed debate turns for this invocation; synthesis is not included. */
	transcript: readonly TeamTurn[];
}

/** Failed result of a team debate, retaining completed turns for optional audit output. */
export interface TeamFailure {
	error: { provider: WebProvider; message: string };
	transcript: readonly TeamTurn[];
}

/** Result of a team debate: a final answer or a failure with completed turns. */
export type TeamResult = TeamSuccess | TeamFailure;

/** Options for {@link runTeam}. */
export interface TeamOptions {
	task: string;
	/** Durable owner key: the current DSH agent/session ID. */
	sessionId: string;
	/** Optional team namespace; teams with different names get separate threads. */
	teamName?: string;
	/** Number of debate rounds (each model speaks once per round). */
	rounds?: number;
	/** Whether to append a final synthesis turn. */
	synthesize?: boolean;
	/** Ordered providers; the first opens the debate. */
	providers?: readonly WebProvider[];
	/** Show automated provider browsers on the user-managed display. */
	visible?: boolean;
	signal?: AbortSignal;
}

/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (provider: WebProvider, request: ChatRequest) => Promise<ChatResult>;

const DEFAULT_ROUNDS = 2;
const DEFAULT_PROVIDERS: readonly WebProvider[] = ["chatgpt-web", "gemini-web"];

function providerName(provider: WebProvider): string {
	if (provider === "chatgpt-web") return "ChatGPT";
	if (provider === "gemini-web") return "Gemini";
	return provider;
}

/** Join display names with an Oxford comma: "A", "A and B", "A, B, and C". */
export function joinNames(names: readonly string[]): string {
	if (names.length === 0) return "";
	if (names.length === 1) return names[0];
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function assertNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
	}
}

/**
 * Compose the prompt for one debate turn. The opener (round 1, before any
 * teammate has spoken) asks for an initial analysis; later turns feed every
 * other model's latest message and ask for critique and refinement. Each
 * model's own history already lives in its native conversation, so only the
 * other models' latest messages need to be injected.
 */
export function composeTurnPrompt(
	task: string,
	provider: WebProvider,
	others: readonly OtherContribution[],
	round: number,
): string {
	const name = providerName(provider);
	const teamLine = `You are ${name} on a team with ${joinNames(others.map((other) => providerName(other.provider)))}.`;
	if (round === 1 && others.every((other) => other.text.trim() === "")) {
		return [
			teamLine,
			"",
			`Task: ${task}`,
			"",
			"Give your initial analysis and proposed approach. Be concrete and specific.",
		].join("\n");
	}
	const lines = [teamLine, "", `Task: ${task}`, ""];
	for (const other of others) {
		lines.push(`${providerName(other.provider)} said:`, '"""', other.text, '"""', "");
	}
	lines.push(`Respond as ${name}: critique, refine, and improve toward the best combined answer.`);
	return lines.join("\n");
}

/** Compose the final synthesis prompt from the full debate transcript. */
export function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string {
	const lines = [
		"Here is the full debate on the task. Produce a single final answer that combines the best perspectives.",
		"",
		`Task: ${task}`,
		"",
		"Debate:",
	];
	for (const turn of transcript) {
		lines.push("", `### ${providerName(turn.provider)} (round ${turn.round})`, turn.text);
	}
	lines.push("", "Final answer (best of both):");
	return lines.join("\n");
}

/**
 * Run a multi-model debate: the providers speak in order each round, each
 * seeing every other model's latest message, then (optionally) the last
 * speaker synthesizes a single final answer from the full transcript. The team
 * uses a derived session key so its conversations are isolated from the
 * agent's own direct `browser_chat` threads yet durable across repeated calls.
 */
export async function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult> {
	const rounds = options.rounds ?? DEFAULT_ROUNDS;
	const synthesize = options.synthesize ?? true;
	const providers = options.providers ?? DEFAULT_PROVIDERS;
	if (!Number.isInteger(rounds) || rounds <= 0) {
		throw new Error("team debate rounds must be a positive integer");
	}
	if (providers.length < 2) {
		throw new Error("team debate requires at least two providers");
	}
	if (new Set(providers).size !== providers.length) {
		throw new Error("team debate providers must not contain duplicates");
	}
	const teamSessionId = `${options.sessionId}:team:${options.teamName ?? "default"}`;

	const transcript: TeamTurn[] = [];
	const lastByProvider = new Map<WebProvider, string>();
	let lastProvider: WebProvider = providers[0];

	try {
		for (let round = 1; round <= rounds; round++) {
			for (const provider of providers) {
				assertNotAborted(options.signal);
				lastProvider = provider;
				const others = providers
					.filter((other) => other !== provider)
					.map((other) => ({ provider: other, text: lastByProvider.get(other) ?? "" }));
				const prompt = composeTurnPrompt(options.task, provider, others, round);
				const result = await chat(provider, {
					prompt,
					sessionId: teamSessionId,
					visible: options.visible,
					signal: options.signal,
				});
				lastByProvider.set(provider, result.text);
				transcript.push({ round, provider, text: result.text });
			}
		}

		if (synthesize) {
			assertNotAborted(options.signal);
			const prompt = composeSynthesisPrompt(options.task, transcript);
			const result = await chat(lastProvider, {
				prompt,
				sessionId: teamSessionId,
				visible: options.visible,
				signal: options.signal,
			});
			return { finalAnswer: result.text, finalProvider: lastProvider, transcript: [...transcript] };
		}

		const finalAnswer = lastByProvider.get(lastProvider);
		if (finalAnswer === undefined) throw new Error("team debate completed without a final turn");
		return { finalAnswer, finalProvider: lastProvider, transcript: [...transcript] };
	} catch (error) {
		return {
			error: {
				provider: lastProvider,
				message: error instanceof Error ? error.message : String(error),
			},
			transcript: [...transcript],
		};
	}
}
