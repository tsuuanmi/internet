import type { WorkflowInputBundle } from "#internet/workflow/kernel/types";
import { type WorkflowAcceptanceCriteriaPayload, type WorkflowFindingPayload, type WorkflowNeedPayload, type WorkflowNeedType, type WorkflowObjectivePayload, type WorkflowPlanPayload } from "#internet/workflow/semantic/types";
export declare const WORKFLOW_PLANNING_MODES: readonly ["INITIAL", "PLAN_CHANGE", "REQUIREMENTS_CHANGE", "CLARIFICATION"];
export type WorkflowPlanningMode = (typeof WORKFLOW_PLANNING_MODES)[number];
export type WorkflowPlanningNeedType = Exclude<WorkflowNeedType, "execution">;
export declare const WORKFLOW_PLANNING_MODE_BY_NEED_TYPE: {
    readonly planning: "INITIAL";
    readonly plan_change: "PLAN_CHANGE";
    readonly requirements_change: "REQUIREMENTS_CHANGE";
    readonly clarification: "CLARIFICATION";
};
export declare const WORKFLOW_PLANNING_INPUT_SCHEMA: {
    readonly id: "workflow.planning.input";
    readonly version: "1";
};
export declare const WORKFLOW_PLANNING_OUTPUT_SCHEMA: {
    readonly id: "workflow.planning.output";
    readonly version: "1";
};
export declare const WORKFLOW_PLANNING_CAPABILITY: {
    readonly id: "planning";
    readonly version: "1";
    readonly acceptedNeedTypes: string[];
    readonly producedArtifactTypes: readonly ["objective", "acceptance_criteria", "plan", "need", "finding"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["reasoning"];
    readonly inputSchema: {
        readonly id: "workflow.planning.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.planning.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["requirement_revision_authority", "clarification"];
};
export interface WorkflowPlanningRequest {
    readonly mode: WorkflowPlanningMode;
    readonly inputBundle: WorkflowInputBundle;
}
export interface WorkflowPlanningOutput {
    readonly mode: WorkflowPlanningMode;
    readonly objective?: WorkflowObjectivePayload;
    readonly acceptanceCriteria?: WorkflowAcceptanceCriteriaPayload;
    readonly plan?: WorkflowPlanPayload;
    readonly needs: readonly WorkflowNeedPayload[];
    readonly findings: readonly WorkflowFindingPayload[];
}
export interface WorkflowPlanningExecutor {
    execute(request: WorkflowPlanningRequest): Promise<unknown>;
}
export declare function workflowPlanningModeForNeedType(needType: WorkflowNeedType): WorkflowPlanningMode | undefined;
export declare function parseWorkflowPlanningOutput(value: unknown): WorkflowPlanningOutput;
export declare function executeWorkflowPlanning(executor: WorkflowPlanningExecutor, request: WorkflowPlanningRequest): Promise<WorkflowPlanningOutput>;
//# sourceMappingURL=planning.d.ts.map