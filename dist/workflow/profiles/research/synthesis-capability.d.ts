import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare const RESEARCH_SYNTHESIS_CAPABILITY: {
    readonly id: "research.synthesize_report";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["report", "need"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["research_synthesis"];
    readonly inputSchema: {
        readonly id: "workflow.research.synthesis.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.research.synthesis.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["research_evidence_set"];
};
export declare class WorkflowResearchSynthesisAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "research_synthesis";
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=synthesis-capability.d.ts.map