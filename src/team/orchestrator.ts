import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { getAccountDefinition } from "#internet/core/accounts";
import { InternetError, isInternetError } from "#internet/core/errors";
import { getTeamPromptStrategy, type TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type {
	OtherContribution,
	TeamFailureDetail,
	TeamFailureKind,
	TeamProgressEvent,
	TeamStage,
	TeamTurn,
} from "#internet/team/types";

export type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
export type {
	OtherContribution,
	TeamFailureDetail,
	TeamProgressEvent,
	TeamStage,
	TeamTurn,
} from "#internet/team/types";

/** Successful result of a team debate. */
export interface TeamSuccess {
	readonly finalAnswer: string;
	readonly finalAccountId: AccountId;
	readonly finalProvider: ReturnType<typeof getAccountDefinition>["provider"];
	/** Completed debate turns for this invocation; synthesis is not included. */
	readonly transcript: readonly TeamTurn[];
}

/** Failed result of a team debate, retaining completed turns for audit/diagnostics. */
export interface TeamFailure {
	readonly error: TeamFailureDetail;
	readonly transcript: readonly TeamTurn[];
}

export type TeamResult = TeamSuccess | TeamFailure;
export type TeamProgressObserver = (event: TeamProgressEvent) => void;

/** Options for {@link runTeam}. */
export interface TeamOptions {
	readonly task: string;
	/** Exact durable conversation owner key used for every account in this team lane. */
	readonly sessionId: string;
	/** Number of debate rounds (each account speaks once per round). */
	readonly rounds?: number;
	/** Whether to append a final synthesis turn. */
	readonly synthesize?: boolean;
	/** Account that performs the final synthesis, independent of speaking order. */
	readonly synthesizer?: AccountId;
	/** Ordered reasoning accounts; the first opens the debate. */
	readonly accounts?: readonly AccountId[];
	/** Prompt composition purpose. The execution engine remains shared. */
	readonly promptStrategy?: TeamPromptStrategyId;
	/** Show automated account browsers on the user-managed display. */
	readonly visible?: boolean;
	readonly signal?: AbortSignal;
	/** Best-effort structured lifecycle observer; observer failure never changes team correctness. */
	readonly onProgress?: TeamProgressObserver;
}

/** A single-turn chat function, injected so the loop is unit-testable. */
export type ChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;

const DEFAULT_ROUNDS = 2;
const DEFAULT_ACCOUNTS: readonly AccountId[] = ["chatgpt-thinker", "gemini-thinker"];
const DEFAULT_SYNTHESIZER: AccountId = "chatgpt-thinker";
const DEFAULT_PROMPT_STRATEGY: TeamPromptStrategyId = "generic-debate";

/** Join display names with an Oxford comma. Retained as a small public utility. */
export function joinNames(names: readonly string[]): string {
	if (names.length === 0) return "";
	if (names.length === 1) return names[0] ?? "";
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function assertNotAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
}

function now(): string {
	return new Date().toISOString();
}

function emit(observer: TeamProgressObserver | undefined, event: TeamProgressEvent): void {
	if (observer === undefined) return;
	try {
		observer(event);
	} catch {
		// Observability is never part of team correctness.
	}
}

function failureKind(error: unknown): TeamFailureKind {
	if (isInternetError(error)) return error.kind;
	if (error instanceof Error && error.name === "AbortError") return "aborted";
	return "unexpected_error";
}

function retryable(kind: TeamFailureKind): boolean {
	return kind === "browser_unavailable" || kind === "provider_error" || kind === "timeout";
}

function failureDetail(error: unknown, accountId: AccountId, stage: TeamStage, round?: number): TeamFailureDetail {
	const kind = failureKind(error);
	return {
		accountId,
		provider: getAccountDefinition(accountId).provider,
		stage,
		...(round === undefined ? {} : { round }),
		kind,
		message: error instanceof Error ? error.message : String(error),
		retryable: retryable(kind),
		failedAt: now(),
	};
}

/** Compose the default generic prompt for one debate turn. */
export function composeTurnPrompt(
	task: string,
	accountId: AccountId,
	others: readonly OtherContribution[],
	round: number,
): string {
	return getTeamPromptStrategy("generic-debate").turn({ task, accountId, others, round });
}

/** Compose the default generic final synthesis prompt. */
export function composeSynthesisPrompt(task: string, transcript: readonly TeamTurn[]): string {
	return getTeamPromptStrategy("generic-debate").synthesis({ task, transcript });
}

/**
 * Run a multi-model debate using an exact durable conversation-session key.
 * Callers own namespace construction; this primitive owns the single authoritative
 * round/synthesis loop and emits structured progress for optional durable observers.
 */
export async function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult> {
	const rounds = options.rounds ?? DEFAULT_ROUNDS;
	const synthesize = options.synthesize ?? true;
	const synthesizer = options.synthesizer ?? DEFAULT_SYNTHESIZER;
	const accounts = options.accounts ?? DEFAULT_ACCOUNTS;
	const prompts = getTeamPromptStrategy(options.promptStrategy ?? DEFAULT_PROMPT_STRATEGY);
	if (!Number.isInteger(rounds) || rounds <= 0) throw new Error("team debate rounds must be a positive integer");
	if (accounts.length < 2) throw new Error("team debate requires at least two accounts");
	if (new Set(accounts).size !== accounts.length) throw new Error("team debate accounts must not contain duplicates");
	if (synthesize && !accounts.includes(synthesizer))
		throw new Error("team synthesizer must be one of the selected accounts");
	if (options.sessionId.trim() === "") throw new Error("team debate sessionId must not be empty");

	const transcript: TeamTurn[] = [];
	const lastByAccount = new Map<AccountId, string>();
	let activeAccountId: AccountId = accounts[0] ?? DEFAULT_SYNTHESIZER;
	let activeStage: TeamStage = "prepare_prompt";
	let activeRound: number | undefined = 1;
	let finalDebateAccountId: AccountId = activeAccountId;

	try {
		for (let round = 1; round <= rounds; round++) {
			for (const accountId of accounts) {
				assertNotAborted(options.signal);
				activeAccountId = accountId;
				activeRound = round;
				finalDebateAccountId = accountId;
				const provider = getAccountDefinition(accountId).provider;
				const others = accounts
					.filter((other) => other !== accountId)
					.map((other) => ({
						accountId: other,
						provider: getAccountDefinition(other).provider,
						text: lastByAccount.get(other) ?? "",
					}));

				activeStage = "prepare_prompt";
				emit(options.onProgress, { at: now(), stage: activeStage, status: "started", round, accountId, provider });
				const prompt = prompts.turn({ task: options.task, accountId, others, round });
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "completed",
					round,
					accountId,
					provider,
				});

				activeStage = "provider_turn";
				emit(options.onProgress, { at: now(), stage: activeStage, status: "started", round, accountId, provider });
				const result = await chat(accountId, {
					prompt,
					sessionId: options.sessionId,
					visible: options.visible,
					signal: options.signal,
				});
				lastByAccount.set(accountId, result.text);
				transcript.push({ round, accountId, provider, text: result.text });
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "completed",
					round,
					accountId,
					provider,
					text: result.text,
				});
			}
		}

		if (synthesize) {
			assertNotAborted(options.signal);
			activeAccountId = synthesizer;
			activeRound = undefined;
			activeStage = "synthesis";
			const provider = getAccountDefinition(synthesizer).provider;
			emit(options.onProgress, {
				at: now(),
				stage: activeStage,
				status: "started",
				accountId: synthesizer,
				provider,
			});
			const prompt = prompts.synthesis({ task: options.task, transcript });
			const result = await chat(synthesizer, {
				prompt,
				sessionId: options.sessionId,
				visible: options.visible,
				signal: options.signal,
			});
			emit(options.onProgress, {
				at: now(),
				stage: activeStage,
				status: "completed",
				accountId: synthesizer,
				provider,
				text: result.text,
			});
			emit(options.onProgress, {
				at: now(),
				stage: "complete",
				status: "completed",
				accountId: synthesizer,
				provider,
			});
			return {
				finalAnswer: result.text,
				finalAccountId: synthesizer,
				finalProvider: provider,
				transcript: [...transcript],
			};
		}

		const finalAnswer = lastByAccount.get(finalDebateAccountId);
		if (finalAnswer === undefined) throw new Error("team debate completed without a final turn");
		const provider = getAccountDefinition(finalDebateAccountId).provider;
		emit(options.onProgress, {
			at: now(),
			stage: "complete",
			status: "completed",
			accountId: finalDebateAccountId,
			provider,
		});
		return {
			finalAnswer,
			finalAccountId: finalDebateAccountId,
			finalProvider: provider,
			transcript: [...transcript],
		};
	} catch (error) {
		const failure = failureDetail(error, activeAccountId, activeStage, activeRound);
		emit(options.onProgress, {
			at: failure.failedAt,
			stage: failure.stage,
			status: "failed",
			...(failure.round === undefined ? {} : { round: failure.round }),
			accountId: failure.accountId,
			provider: failure.provider,
			kind: failure.kind,
			message: failure.message,
			retryable: failure.retryable,
		});
		return { error: failure, transcript: [...transcript] };
	}
}
