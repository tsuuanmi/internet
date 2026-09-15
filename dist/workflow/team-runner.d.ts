import type { ProviderProgressEvent } from "#internet/browser/completion";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig } from "#internet/core/config";
import { type TeamStepExecutionResult } from "#internet/team/executor";
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
    readonly onProviderProgress?: (event: ProviderProgressEvent) => void;
}
export interface WorkflowTeamRunner {
    readonly rounds: number;
    runStep(request: WorkflowTeamStepRequest): Promise<TeamStepExecutionResult>;
}
type TeamManager = Pick<BrowserManager, "chat">;
export declare class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
    private readonly manager;
    private readonly config;
    constructor(manager: TeamManager, config: BrowserConfig);
    runStep(request: WorkflowTeamStepRequest): Promise<TeamStepExecutionResult>;
    get rounds(): number;
}
export {};
//# sourceMappingURL=team-runner.d.ts.map