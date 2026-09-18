import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare const SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY: {
    readonly id: "software.repository_research";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["evidence"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["software_repository_research"];
    readonly inputSchema: {
        readonly id: "workflow.software.repository-research.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.software.repository-research.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["software_repository_scope"];
};
export declare class WorkflowSoftwareRepositoryResearchAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "software_repository_research";
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=research-capability.d.ts.map