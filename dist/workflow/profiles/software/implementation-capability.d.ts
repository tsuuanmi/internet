import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowWriterControlRequest, WorkflowWriterRunner } from "#internet/workflow/writer-runner";
export declare const SOFTWARE_IMPLEMENTATION_CAPABILITY: {
    readonly id: "software.implementation_change";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["delivery"];
    readonly producedReceiptTypes: readonly ["software.pull_request"];
    readonly sideEffect: "CONTROLLED_MUTATION";
    readonly requiredAuthority: readonly ["repository_mutation"];
    readonly executorKinds: readonly ["software_implementation"];
    readonly inputSchema: {
        readonly id: "workflow.software.implementation.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.software.implementation.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["software_mutation_scope", "exact_head_reconciliation"];
};
export type WorkflowSoftwareWriterRequestProjector = (context: WorkflowCapabilityExecutionContext) => WorkflowWriterControlRequest;
export declare class WorkflowSoftwareImplementationAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "software_implementation";
    private readonly runner;
    private readonly project;
    constructor(runner: WorkflowWriterRunner, project: WorkflowSoftwareWriterRequestProjector);
    execute(context: WorkflowCapabilityActiveExecutionContext): Promise<WorkflowSemanticExecutionResult>;
    reconcile(context: WorkflowCapabilityExecutionContext): Promise<WorkflowSemanticExecutionResult | undefined>;
}
//# sourceMappingURL=implementation-capability.d.ts.map