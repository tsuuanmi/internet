import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";

/** One completed contribution in a team debate. */
export interface TeamTurn {
	round: number;
	accountId: AccountId;
	provider: WebProvider;
	text: string;
}

/** A teammate's latest message, shown to the current speaker. */
export interface OtherContribution {
	accountId: AccountId;
	provider: WebProvider;
	text: string;
}

/** Successful result of a team debate. */
export interface TeamSuccess {
	finalAnswer: string;
	finalAccountId: AccountId;
	finalProvider: WebProvider;
	/** Completed debate turns for this invocation; synthesis is not included. */
	transcript: readonly TeamTurn[];
}

/** Failed result of a team debate, retaining completed turns for optional audit output. */
export interface TeamFailure {
	error: { accountId: AccountId; provider: WebProvider; message: string };
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
	/** Number of debate rounds (each account speaks once per round). */
	rounds?: number;
	/** Whether to append a final synthesis turn. */
	synthesize?: boolean;
	/** Account that performs the final synthesis, independent of speaking order. */
	synthesizer?: AccountId;
	/** Ordered reasoning accounts; the first opens the debate. */
	accounts?: readonly AccountId[];
	/** Show automated account browsers on the user-managed display. */
	visible?: boolean;
	signal?: AbortSignal;
}

/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;

const DEFAULT_ROUNDS = 2;
const DEFAULT_ACCOUNTS: readonly AccountId[] = ["chatgpt-thinker", "gemini-thinker"];
const DEFAULT_SYNTHESIZER: AccountId = "chatgpt-thinker";

function accountName(accountId: AccountId): string {
	if (accountId === "chatgpt-thinker") return "ChatGPT";
	if (accountId === "gemini-thinker") return "Gemini";
	return accountId;
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

/** Compose the prompt for one debate turn. */
export function composeTurnPrompt(
	task: string,
	accountId: AccountId,
	others: readonly OtherContribution[],
	round: number,
): string {
	const name = accountName(accountId);
	const teamLine = `You are ${name} on a team with ${joinNames(others.map((other) => accountName(other.accountId)))}.`;
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
		lines.push(`${accountName(other.accountId)} said:`, '"""', other.text, '"""', "");
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
		lines.push("", `### ${accountName(turn.accountId)} (round ${turn.round})`, turn.text);
	}
	lines.push("", "Final answer (best of both):");
	return lines.join("\n");
}

/**
 * Run a multi-model debate using explicit authenticated accounts. Each account
 * has its own durable browser state, conversation namespace, and scheduler.
 */
export async function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult> {
	const rounds = options.rounds ?? DEFAULT_ROUNDS;
	const synthesize = options.synthesize ?? true;
	const synthesizer = options.synthesizer ?? DEFAULT_SYNTHESIZER;
	const accounts = options.accounts ?? DEFAULT_ACCOUNTS;
	if (!Number.isInteger(rounds) || rounds <= 0) {
		throw new Error("team debate rounds must be a positive integer");
	}
	if (accounts.length < 2) {
		throw new Error("team debate requires at least two accounts");
	}
	if (new Set(accounts).size !== accounts.length) {
		throw new Error("team debate accounts must not contain duplicates");
	}
	if (synthesize && !accounts.includes(synthesizer)) {
		throw new Error("team synthesizer must be one of the selected accounts");
	}
	const teamSessionId = `${options.sessionId}:team:${options.teamName ?? "default"}`;

	const transcript: TeamTurn[] = [];
	const lastByAccount = new Map<AccountId, string>();
	let activeAccountId: AccountId = accounts[0];
	let finalDebateAccountId: AccountId = accounts[0];

	try {
		for (let round = 1; round <= rounds; round++) {
			for (const accountId of accounts) {
				assertNotAborted(options.signal);
				activeAccountId = accountId;
				finalDebateAccountId = accountId;
				const others = accounts
					.filter((other) => other !== accountId)
					.map((other) => ({
						accountId: other,
						provider: getAccountDefinition(other).provider,
						text: lastByAccount.get(other) ?? "",
					}));
				const prompt = composeTurnPrompt(options.task, accountId, others, round);
				const result = await chat(accountId, {
					prompt,
					sessionId: teamSessionId,
					visible: options.visible,
					signal: options.signal,
				});
				lastByAccount.set(accountId, result.text);
				transcript.push({
					round,
					accountId,
					provider: getAccountDefinition(accountId).provider,
					text: result.text,
				});
			}
		}

		if (synthesize) {
			assertNotAborted(options.signal);
			activeAccountId = synthesizer;
			const prompt = composeSynthesisPrompt(options.task, transcript);
			const result = await chat(synthesizer, {
				prompt,
				sessionId: teamSessionId,
				visible: options.visible,
				signal: options.signal,
			});
			return {
				finalAnswer: result.text,
				finalAccountId: synthesizer,
				finalProvider: getAccountDefinition(synthesizer).provider,
				transcript: [...transcript],
			};
		}

		const finalAnswer = lastByAccount.get(finalDebateAccountId);
		if (finalAnswer === undefined) throw new Error("team debate completed without a final turn");
		return {
			finalAnswer,
			finalAccountId: finalDebateAccountId,
			finalProvider: getAccountDefinition(finalDebateAccountId).provider,
			transcript: [...transcript],
		};
	} catch (error) {
		return {
			error: {
				accountId: activeAccountId,
				provider: getAccountDefinition(activeAccountId).provider,
				message: error instanceof Error ? error.message : String(error),
			},
			transcript: [...transcript],
		};
	}
}
