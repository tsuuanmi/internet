import type { WorkflowCriterionAssessmentRequirement } from "#internet/workflow/semantic/assessment";
import type { WorkflowAssessmentSubject, WorkflowCriterionAssessmentPayload, WorkflowFindingPayload, WorkflowPlanTaskExecutionState, WorkflowPlanTaskRef } from "#internet/workflow/semantic/types";
export interface WorkflowConvergenceAssessmentState {
    readonly artifactId: string;
    readonly current: boolean;
    readonly assessment: WorkflowCriterionAssessmentPayload;
}
export interface WorkflowConvergenceArtifactState {
    readonly artifactId: string;
    readonly type: string;
    readonly current: boolean;
}
export interface WorkflowConvergenceFindingState {
    readonly finding: WorkflowFindingPayload;
    readonly resolved: boolean;
}
export interface WorkflowConvergenceAuthorityRequirement {
    readonly id: string;
    readonly subject: WorkflowAssessmentSubject;
}
export interface WorkflowConvergenceGateState extends WorkflowConvergenceAuthorityRequirement {
    readonly resolved: boolean;
}
export interface WorkflowConvergenceDependencyState {
    readonly id: string;
    readonly resolved: boolean;
}
export interface WorkflowConvergencePolicy {
    readonly criteria: readonly WorkflowCriterionAssessmentRequirement[];
    readonly requiredDeliverableTypes: readonly string[];
    readonly requiredAuthorityGates: readonly WorkflowConvergenceAuthorityRequirement[];
    readonly requiredReceiptIds: readonly string[];
    readonly requiredDependencyIds: readonly string[];
    readonly requiredPlanTasks?: readonly WorkflowPlanTaskRef[];
}
export interface WorkflowConvergenceState {
    readonly assessments: readonly WorkflowConvergenceAssessmentState[];
    readonly findings: readonly WorkflowConvergenceFindingState[];
    readonly deliverables: readonly WorkflowConvergenceArtifactState[];
    readonly authorityGates: readonly WorkflowConvergenceGateState[];
    readonly receiptIds: readonly string[];
    readonly dependencies: readonly WorkflowConvergenceDependencyState[];
    readonly planTasks: readonly WorkflowPlanTaskExecutionState[];
}
export declare const WORKFLOW_CONVERGENCE_BLOCKER_KINDS: readonly ["criterion", "finding", "deliverable", "authority", "receipt", "dependency", "plan_task"];
export type WorkflowConvergenceBlockerKind = (typeof WORKFLOW_CONVERGENCE_BLOCKER_KINDS)[number];
export interface WorkflowConvergenceBlocker {
    readonly kind: WorkflowConvergenceBlockerKind;
    readonly id: string;
    readonly reason: string;
}
export interface WorkflowConvergenceResult {
    readonly converged: boolean;
    readonly blockers: readonly WorkflowConvergenceBlocker[];
}
export declare function evaluateWorkflowConvergence(policy: WorkflowConvergencePolicy, state: WorkflowConvergenceState): WorkflowConvergenceResult;
//# sourceMappingURL=convergence.d.ts.map