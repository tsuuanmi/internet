import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
export declare const SOFTWARE_REVIEW_CAPABILITY: {
    readonly id: "software.review_current_state";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["evidence", "finding"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["software_review"];
    readonly inputSchema: {
        readonly id: "workflow.software.review.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.software.review.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["exact_subject_review"];
};
export declare class WorkflowSoftwareReviewAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "software_review";
    private readonly runner;
    private readonly artifacts;
    constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
//# sourceMappingURL=review-capability.d.ts.map