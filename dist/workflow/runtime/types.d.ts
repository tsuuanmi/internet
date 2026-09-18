import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import type { WorkflowArtifact, WorkflowArtifactRef, WorkflowInputBundle, WorkflowInputFact, WorkflowRun, WorkflowVersionRef, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import type { WorkflowConvergencePolicy, WorkflowConvergenceState, WorkflowNeedPayload, WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
export declare const WORKFLOW_EXECUTION_SCHEMA: "@tsuuanmi/internet-workflow-execution";
export declare const WORKFLOW_EXECUTION_STATES: readonly ["RUNNING", "SUCCEEDED", "FAILED", "FENCED"];
export type WorkflowExecutionState = (typeof WORKFLOW_EXECUTION_STATES)[number];
export interface WorkflowExecutionFailure {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
}
export interface WorkflowExecution {
    readonly schema: typeof WORKFLOW_EXECUTION_SCHEMA;
    readonly version: 1;
    readonly revision: number;
    readonly executionId: string;
    readonly runId: string;
    readonly workItemId: string;
    readonly inputBundleId: string;
    readonly capability: WorkflowVersionRef;
    readonly attempt: number;
    readonly ownerInstanceId: string;
    readonly state: WorkflowExecutionState;
    readonly startedAt: string;
    readonly heartbeatAt: string;
    readonly leaseUntil: string;
    readonly finishedAt?: string;
    readonly failure?: WorkflowExecutionFailure;
}
export interface WorkflowCapabilityExecutionContext {
    readonly run: WorkflowRun;
    readonly workItem: WorkflowWorkItem;
    readonly execution: WorkflowExecution;
    readonly inputBundle: WorkflowInputBundle;
}
export interface WorkflowCapabilityActiveExecutionContext extends WorkflowCapabilityExecutionContext {
    readonly heartbeat: () => WorkflowExecution;
}
export interface WorkflowCapabilityExecutor {
    readonly kind: string;
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
    reconcile?(context: WorkflowCapabilityExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult | undefined>;
}
export interface WorkflowNeedRuntimeContext {
    readonly run: WorkflowRun;
    readonly needArtifact: WorkflowArtifact;
    readonly need: WorkflowNeedPayload;
    readonly artifacts: readonly WorkflowArtifact[];
    readonly workItems: readonly WorkflowWorkItem[];
}
export interface WorkflowWorkItemMaterialization {
    readonly kind: "work_item";
    readonly capability: WorkflowVersionRef;
    readonly authorityRef?: string;
    readonly budgetRef?: string;
}
export interface WorkflowPendingActionMaterialization {
    readonly kind: "pending_action";
    readonly actionType: string;
}
export type WorkflowNeedMaterialization = WorkflowWorkItemMaterialization | WorkflowPendingActionMaterialization;
export interface WorkflowPendingActionMaterializer {
    ensure(run: WorkflowRun, needArtifact: WorkflowArtifact, need: WorkflowNeedPayload, actionType: string): void;
    hasOpen(runId: string, needArtifactId: string): boolean;
}
export interface WorkflowReadinessDecision {
    readonly ready: boolean;
    readonly artifacts: readonly WorkflowArtifactRef[];
    readonly facts: readonly WorkflowInputFact[];
    readonly blockers: readonly string[];
}
export interface WorkflowRuntimePolicy {
    materializeNeed(context: WorkflowNeedRuntimeContext): WorkflowNeedMaterialization;
    readiness(context: WorkflowNeedRuntimeContext, workItem: WorkflowWorkItem): WorkflowReadinessDecision;
    convergence(run: WorkflowRun): {
        readonly policy: WorkflowConvergencePolicy;
        readonly state: WorkflowConvergenceState;
    };
}
export interface WorkflowCapabilityExecutorRegistry {
    resolve(capability: WorkflowCapabilityDescriptor): WorkflowCapabilityExecutor;
}
//# sourceMappingURL=types.d.ts.map