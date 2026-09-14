import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import type { ProviderProgressEvent } from "#internet/browser/completion";
import { type AccountId, getAccountDefinition } from "#internet/core/accounts";
import { InternetError, isInternetError } from "#internet/core/errors";
import { prepareTeamStep, type TeamPlan, type TeamPlanStep } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamFailureDetail, TeamFailureKind, TeamProgressEvent, TeamStage, TeamTurn } from "#internet/team/types";

export type TeamChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;
export type TeamProgressObserver = (event: TeamProgressEvent) => void;

export interface TeamStepExecutionOptions {
	readonly plan: TeamPlan;
	readonly step: TeamPlanStep;
	readonly task: string;
	readonly transcript: readonly TeamTurn[];
	readonly promptStrategy: TeamPromptStrategyId;
	readonly sessionId: string;
	readonly visible?: boolean;
	readonly timeoutMs?: number;
	readonly stallTimeoutMs?: number;
	readonly signal?: AbortSignal;
	readonly onProgress?: TeamProgressObserver;
	readonly onProviderProgress?: (event: ProviderProgressEvent) => void;
}

export type TeamStepExecutionResult =
	| { readonly ok: true; readonly step: TeamPlanStep; readonly turn?: TeamTurn; readonly finalAnswer?: string }
	| { readonly ok: false; readonly error: TeamFailureDetail };

function now(): string {
	return new Date().toISOString();
}

function emit(observer: TeamProgressObserver | undefined, event: TeamProgressEvent): void {
	if (observer === undefined) return;
	try {
		observer(event);
	} catch {
		// Observability never changes team correctness.
	}
}

function assertNotAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
}

function failureKind(error: unknown): TeamFailureKind {
	if (isInternetError(error)) return error.kind;
	if (error instanceof Error && error.name === "AbortError") return "aborted";
	return "unexpected_error";
}

function retryable(kind: TeamFailureKind): boolean {
	return (
		kind === "browser_unavailable" ||
		kind === "provider_error" ||
		kind === "provider_stalled" ||
		kind === "timeout"
	);
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

function requestFor(options: TeamStepExecutionOptions, prompt: string): ChatRequest {
	return {
		prompt,
		sessionId: options.sessionId,
		visible: options.visible,
		timeoutMs: options.timeoutMs,
		stallTimeoutMs: options.stallTimeoutMs,
		onProgress: options.onProviderProgress,
		signal: options.signal,
	};
}

export async function runTeamStep(
	chat: TeamChatFn,
	options: TeamStepExecutionOptions,
): Promise<TeamStepExecutionResult> {
	if (options.sessionId.trim() === "") throw new Error("team debate sessionId must not be empty");
	const { step } = options;
	const provider = getAccountDefinition(step.accountId).provider;
	let stage: TeamStage = step.kind === "member" ? "prepare_prompt" : "synthesis";
	try {
		assertNotAborted(options.signal);
		if (step.kind === "member") {
			emit(options.onProgress, {
				at: now(),
				stage,
				status: "started",
				round: step.round,
				accountId: step.accountId,
				provider,
			});
			const prepared = prepareTeamStep(options.plan, step, options.task, options.transcript, options.promptStrategy);
			emit(options.onProgress, {
				at: now(),
				stage,
				status: "completed",
				round: step.round,
				accountId: step.accountId,
				provider,
			});
			stage = "provider_turn";
			emit(options.onProgress, {
				at: now(),
				stage,
				status: "started",
				round: step.round,
				accountId: step.accountId,
				provider,
			});
			const result = await chat(step.accountId, requestFor(options, prepared.prompt));
			const turn: TeamTurn = { round: step.round, accountId: step.accountId, provider, text: result.text };
			emit(options.onProgress, {
				at: now(),
				stage,
				status: "completed",
				round: step.round,
				accountId: step.accountId,
				provider,
				text: result.text,
			});
			return { ok: true, step, turn };
		}

		const prepared = prepareTeamStep(options.plan, step, options.task, options.transcript, options.promptStrategy);
		emit(options.onProgress, { at: now(), stage, status: "started", accountId: step.accountId, provider });
		const result = await chat(step.accountId, requestFor(options, prepared.prompt));
		emit(options.onProgress, {
			at: now(),
			stage,
			status: "completed",
			accountId: step.accountId,
			provider,
			text: result.text,
		});
		return { ok: true, step, finalAnswer: result.text };
	} catch (error) {
		const failure = failureDetail(error, step.accountId, stage, step.kind === "member" ? step.round : undefined);
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
		return { ok: false, error: failure };
	}
}
