import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare const SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY: {
    readonly id: "software.feedback_interpretation";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["finding", "need"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["software_feedback_interpretation"];
    readonly inputSchema: {
        readonly id: "workflow.software.feedback.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.software.feedback.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["software_feedback_semantics"];
};
export declare class WorkflowSoftwareFeedbackInterpretationAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "software_feedback_interpretation";
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=feedback-capability.d.ts.map