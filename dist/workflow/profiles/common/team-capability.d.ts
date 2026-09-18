import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
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
export declare function runWorkflowTeamCapability(runner: WorkflowTeamRunner, request: WorkflowTeamCapabilityRequest): Promise<string>;
//# sourceMappingURL=team-capability.d.ts.map