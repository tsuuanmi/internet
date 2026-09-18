import { DEFAULT_TEAM_ACCOUNTS, DEFAULT_TEAM_SYNTHESIZER } from "#internet/core/accounts";
import { buildTeamPlan } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamTurn } from "#internet/team/types";
import type { WorkflowInputBundle } from "#internet/workflow/kernel/types";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";

export interface WorkflowTeamCapabilityRequest {
	readonly runId: string;
	readonly inputBundle: WorkflowInputBundle;
	readonly task: string;
	readonly promptStrategy: TeamPromptStrategyId;
	readonly scope: string;
	readonly signal?: AbortSignal;
}

export async function runWorkflowTeamCapability(
	runner: WorkflowTeamRunner,
	request: WorkflowTeamCapabilityRequest,
): Promise<string> {
	const plan = buildTeamPlan({
		accounts: DEFAULT_TEAM_ACCOUNTS,
		rounds: runner.rounds,
		synthesize: true,
		synthesizer: DEFAULT_TEAM_SYNTHESIZER,
	});
	const transcript: TeamTurn[] = [];
	let finalAnswer: string | undefined;
	for (const step of plan.steps) {
		const result = await runner.runStep({
			plan,
			step,
			task: request.task,
			transcript,
			promptStrategy: request.promptStrategy,
			sessionId: `workflow:${request.runId}:${request.scope}`,
			requestKey: `${request.runId}:${request.scope}:${request.inputBundle.workItemId}:${step.stepId}`,
			signal: request.signal,
		});
		if (!result.ok) throw new Error(result.error.message);
		if (result.turn !== undefined) transcript.push(result.turn);
		if (result.finalAnswer !== undefined) finalAnswer = result.finalAnswer;
	}
	if (finalAnswer === undefined || finalAnswer.trim() === "") {
		throw new Error(`workflow ${request.scope} capability did not produce a synthesis result`);
	}
	return finalAnswer;
}
