import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { DEFAULT_TEAM_ACCOUNTS, DEFAULT_TEAM_SYNTHESIZER, getAccountDefinition } from "#internet/core/accounts";
import { InternetError, isInternetError } from "#internet/core/errors";
import { buildTeamPlan, prepareTeamStep } from "#internet/team/plan";
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
	/** Ordered reasoning accounts. Prompt roles are Member 1..N in this order. */
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
	members: readonly AccountId[] = [accountId, ...others.map((other) => other.accountId)],
): string {
	return getTeamPromptStrategy("generic-debate").turn({ task, accountId, members, others, round });
}

/** Compose the default generic final synthesis prompt. */
export function composeSynthesisPrompt(
	task: string,
	transcript: readonly TeamTurn[],
	members: readonly AccountId[] = [...new Set(transcript.map((turn) => turn.accountId))],
): string {
	return getTeamPromptStrategy("generic-debate").synthesis({ task, members, transcript });
}

/**
 * Run a provider-agnostic member debate using an exact durable conversation-session key.
 * The shared deterministic plan owns speaking order and prompt dependencies; this wrapper
 * executes that plan in memory for callers that do not persist individual steps.
 */
export async function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult> {
	const rounds = options.rounds ?? DEFAULT_ROUNDS;
	const synthesize = options.synthesize ?? true;
	const synthesizer = options.synthesizer ?? DEFAULT_TEAM_SYNTHESIZER;
	const accounts = options.accounts ?? DEFAULT_TEAM_ACCOUNTS;
	const promptStrategy = options.promptStrategy ?? DEFAULT_PROMPT_STRATEGY;
	const plan = buildTeamPlan({ accounts, rounds, synthesize, synthesizer });
	if (options.sessionId.trim() === "") throw new Error("team debate sessionId must not be empty");

	const transcript: TeamTurn[] = [];
	let activeAccountId: AccountId = accounts[0] ?? DEFAULT_TEAM_SYNTHESIZER;
	let activeStage: TeamStage = "prepare_prompt";
	let activeRound: number | undefined = 1;
	let finalDebateAccountId: AccountId = activeAccountId;

	try {
		for (const step of plan.steps) {
			assertNotAborted(options.signal);
			activeAccountId = step.accountId;
			activeRound = step.kind === "member" ? step.round : undefined;
			const provider = getAccountDefinition(step.accountId).provider;

			if (step.kind === "member") {
				finalDebateAccountId = step.accountId;
				activeStage = "prepare_prompt";
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "started",
					round: step.round,
					accountId: step.accountId,
					provider,
				});
				const prepared = prepareTeamStep(plan, step, options.task, transcript, promptStrategy);
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "completed",
					round: step.round,
					accountId: step.accountId,
					provider,
				});

				activeStage = "provider_turn";
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "started",
					round: step.round,
					accountId: step.accountId,
					provider,
				});
				const result = await chat(step.accountId, {
					prompt: prepared.prompt,
					sessionId: options.sessionId,
					visible: options.visible,
					signal: options.signal,
				});
				transcript.push({ round: step.round, accountId: step.accountId, provider, text: result.text });
				emit(options.onProgress, {
					at: now(),
					stage: activeStage,
					status: "completed",
					round: step.round,
					accountId: step.accountId,
					provider,
					text: result.text,
				});
				continue;
			}

			activeStage = "synthesis";
			emit(options.onProgress, {
				at: now(),
				stage: activeStage,
				status: "started",
				accountId: step.accountId,
				provider,
			});
			const prepared = prepareTeamStep(plan, step, options.task, transcript, promptStrategy);
			const result = await chat(step.accountId, {
				prompt: prepared.prompt,
				sessionId: options.sessionId,
				visible: options.visible,
				signal: options.signal,
			});
			emit(options.onProgress, {
				at: now(),
				stage: activeStage,
				status: "completed",
				accountId: step.accountId,
				provider,
				text: result.text,
			});
			emit(options.onProgress, {
				at: now(),
				stage: "complete",
				status: "completed",
				accountId: step.accountId,
				provider,
			});
			return {
				finalAnswer: result.text,
				finalAccountId: step.accountId,
				finalProvider: provider,
				transcript: [...transcript],
			};
		}

		const finalAnswer = [...transcript].reverse().find((turn) => turn.accountId === finalDebateAccountId)?.text;
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
