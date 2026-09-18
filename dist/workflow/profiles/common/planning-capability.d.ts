import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowPlanningExecutor, type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare class WorkflowTeamPlanningExecutor implements WorkflowPlanningExecutor {
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(request: Parameters<WorkflowPlanningExecutor["execute"]>[0]): Promise<unknown>;
}
export declare class WorkflowPlanningCapabilityAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "reasoning";
    private readonly planning;
    private readonly artifacts;
    constructor(planning: WorkflowPlanningExecutor, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=planning-capability.d.ts.map