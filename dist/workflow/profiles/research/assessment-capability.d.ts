import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare const RESEARCH_ASSESSMENT_CAPABILITY: {
    readonly id: "research.assess_report";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["criterion_assessment"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["research_assessment"];
    readonly inputSchema: {
        readonly id: "workflow.research.assessment.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.research.assessment.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["research_report_assessment"];
};
export declare class WorkflowResearchAssessmentAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "research_assessment";
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=assessment-capability.d.ts.map