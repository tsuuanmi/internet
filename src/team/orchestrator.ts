import type { AccountId } from "#internet/core/accounts";
import { DEFAULT_TEAM_ACCOUNTS, DEFAULT_TEAM_SYNTHESIZER, getAccountDefinition } from "#internet/core/accounts";
import {
	runTeamStep,
	type TeamChatFn,
	type TeamProgressObserver as StepProgressObserver,
} from "#internet/team/executor";
import { buildTeamPlan } from "#internet/team/plan";
import { getTeamPromptStrategy, type TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { OtherContribution, TeamFailureDetail, TeamTurn } from "#internet/team/types";

export type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
export type {
	OtherContribution,
	TeamFailureDetail,
	TeamProgressEvent,
	TeamStage,
	TeamTurn,
} from "#internet/team/types";

export interface TeamSuccess {
	readonly finalAnswer: string;
	readonly finalAccountId: AccountId;
	readonly finalProvider: ReturnType<typeof getAccountDefinition>["provider"];
	readonly transcript: readonly TeamTurn[];
}

export interface TeamFailure {
	readonly error: TeamFailureDetail;
	readonly transcript: readonly TeamTurn[];
}

export type TeamResult = TeamSuccess | TeamFailure;
export type TeamProgressObserver = StepProgressObserver;
export type ChatFn = TeamChatFn;

export interface TeamOptions {
	readonly task: string;
	readonly sessionId: string;
	readonly rounds?: number;
	readonly synthesize?: boolean;
	readonly synthesizer?: AccountId;
	readonly accounts?: readonly AccountId[];
	readonly promptStrategy?: TeamPromptStrategyId;
	readonly visible?: boolean;
	readonly signal?: AbortSignal;
	readonly onProgress?: TeamProgressObserver;
}

const DEFAULT_ROUNDS = 2;
const DEFAULT_PROMPT_STRATEGY: TeamPromptStrategyId = "generic-debate";

export function joinNames(names: readonly string[]): string {
	if (names.length === 0) return "";
	if (names.length === 1) return names[0] ?? "";
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function composeTurnPrompt(
	task: string,
	accountId: AccountId,
	others: readonly OtherContribution[],
	round: number,
	members: readonly AccountId[] = [accountId, ...others.map((other) => other.accountId)],
): string {
	return getTeamPromptStrategy("generic-debate").turn({ task, accountId, members, others, round });
}

export function composeSynthesisPrompt(
	task: string,
	transcript: readonly TeamTurn[],
	members: readonly AccountId[] = [...new Set(transcript.map((turn) => turn.accountId))],
): string {
	return getTeamPromptStrategy("generic-debate").synthesis({ task, members, transcript });
}

/** Execute the shared deterministic team plan in memory. Durable workflow execution uses the same runTeamStep primitive. */
export async function runTeam(chat: ChatFn, options: TeamOptions): Promise<TeamResult> {
	const accounts = options.accounts ?? DEFAULT_TEAM_ACCOUNTS;
	const synthesizer = options.synthesizer ?? DEFAULT_TEAM_SYNTHESIZER;
	const promptStrategy = options.promptStrategy ?? DEFAULT_PROMPT_STRATEGY;
	const plan = buildTeamPlan({
		accounts,
		rounds: options.rounds ?? DEFAULT_ROUNDS,
		synthesize: options.synthesize ?? true,
		synthesizer,
	});
	if (options.sessionId.trim() === "") throw new Error("team debate sessionId must not be empty");

	const transcript: TeamTurn[] = [];
	let finalAccountId = accounts[0] ?? synthesizer;
	for (const step of plan.steps) {
		const result = await runTeamStep(chat, {
			plan,
			step,
			task: options.task,
			transcript,
			promptStrategy,
			sessionId: options.sessionId,
			visible: options.visible,
			signal: options.signal,
			onProgress: options.onProgress,
		});
		if (!result.ok) return { error: result.error, transcript: [...transcript] };
		if (result.turn !== undefined) {
			transcript.push(result.turn);
			finalAccountId = result.turn.accountId;
		}
		if (result.finalAnswer !== undefined) {
			const provider = getAccountDefinition(step.accountId).provider;
			options.onProgress?.({
				at: new Date().toISOString(),
				stage: "complete",
				status: "completed",
				accountId: step.accountId,
				provider,
			});
			return {
				finalAnswer: result.finalAnswer,
				finalAccountId: step.accountId,
				finalProvider: provider,
				transcript: [...transcript],
			};
		}
	}

	const finalAnswer = [...transcript].reverse().find((turn) => turn.accountId === finalAccountId)?.text;
	if (finalAnswer === undefined) throw new Error("team debate completed without a final turn");
	const finalProvider = getAccountDefinition(finalAccountId).provider;
	options.onProgress?.({
		at: new Date().toISOString(),
		stage: "complete",
		status: "completed",
		accountId: finalAccountId,
		provider: finalProvider,
	});
	return { finalAnswer, finalAccountId, finalProvider, transcript: [...transcript] };
}
