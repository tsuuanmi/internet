import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig } from "#internet/core/config";
import { runTeamStep, type TeamStepExecutionResult } from "#internet/team/executor";
import type { TeamPlan, TeamPlanStep } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamProgressEvent, TeamTurn } from "#internet/team/types";

export interface WorkflowTeamStepRequest {
	readonly plan: TeamPlan;
	readonly step: TeamPlanStep;
	readonly task: string;
	readonly transcript: readonly TeamTurn[];
	readonly promptStrategy: TeamPromptStrategyId;
	readonly sessionId: string;
	readonly signal?: AbortSignal;
	readonly onProgress?: (event: TeamProgressEvent) => void;
}

export interface WorkflowTeamRunner {
	readonly rounds: number;
	runStep(request: WorkflowTeamStepRequest): Promise<TeamStepExecutionResult>;
}

type TeamManager = Pick<BrowserManager, "chat">;

export class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
	private readonly manager: TeamManager;
	private readonly config: BrowserConfig;

	constructor(manager: TeamManager, config: BrowserConfig) {
		this.manager = manager;
		this.config = config;
	}

	runStep(request: WorkflowTeamStepRequest): Promise<TeamStepExecutionResult> {
		return runTeamStep((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
			plan: request.plan,
			step: request.step,
			task: request.task,
			transcript: request.transcript,
			promptStrategy: request.promptStrategy,
			sessionId: request.sessionId,
			visible: false,
			timeoutMs: this.config.workflowHardTimeoutMs,
			signal: request.signal,
			onProgress: request.onProgress,
		});
	}

	get rounds(): number {
		return this.config.teamRounds;
	}
}
