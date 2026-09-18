import type { WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowArtifactRef, WorkflowEntityRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";
export declare const WORKFLOW_PENDING_ACTION_SCHEMA: "@tsuuanmi/internet-workflow-pending-action";
export declare const WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA: "@tsuuanmi/internet-workflow-pending-action-response";
export declare const WORKFLOW_EXTERNAL_SIGNAL_SCHEMA: "@tsuuanmi/internet-workflow-external-signal";
export declare const WORKFLOW_PENDING_ACTION_STATES: readonly ["PENDING", "RESOLVED", "REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"];
export type WorkflowPendingActionState = (typeof WORKFLOW_PENDING_ACTION_STATES)[number];
export declare const WORKFLOW_RESPONDER_POLICIES: readonly ["USER_AUTHORITY", "LOCAL_AGENT_INPUT", "USER_OR_LOCAL"];
export type WorkflowResponderPolicy = (typeof WORKFLOW_RESPONDER_POLICIES)[number];
export declare const WORKFLOW_RESPONSE_PROVENANCE: readonly ["user_explicit", "local_agent", "operator", "system_policy"];
export type WorkflowResponseProvenance = (typeof WORKFLOW_RESPONSE_PROVENANCE)[number];
export declare const WORKFLOW_PENDING_ACTION_TIMEOUT_POLICIES: readonly ["WAIT_INDEFINITELY", "FAIL_CLOSED", "DEFAULT_REJECT", "ESCALATE_TO_USER", "CANCEL_DEPENDENT_BRANCH"];
export type WorkflowPendingActionTimeoutPolicy = (typeof WORKFLOW_PENDING_ACTION_TIMEOUT_POLICIES)[number];
export interface WorkflowPendingActionSubjectBinding {
    readonly subject: WorkflowEntityRef;
    readonly version: string;
}
export interface WorkflowPendingActionResolution {
    readonly schema: typeof WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA;
    readonly version: 1;
    readonly requestId: string;
    readonly principal: WorkflowPrincipal;
    readonly provenance: WorkflowResponseProvenance;
    readonly responseSchema: WorkflowVersionRef;
    readonly payload: unknown;
    readonly payloadHash: string;
    readonly respondedAt: string;
}
export interface WorkflowPendingAction {
    readonly schema: typeof WORKFLOW_PENDING_ACTION_SCHEMA;
    readonly version: 1;
    readonly revision: number;
    readonly actionId: string;
    readonly runId: string;
    readonly causedBy: WorkflowArtifactRef;
    readonly requestOwner: WorkflowEntityRef;
    readonly actionType: string;
    readonly prompt: string;
    readonly responderPolicy: WorkflowResponderPolicy;
    readonly responseSchema: WorkflowVersionRef;
    readonly authorityRequirement?: string;
    readonly blockingScope: readonly WorkflowEntityRef[];
    readonly artifactBindings: readonly WorkflowArtifactRef[];
    readonly subjectBindings: readonly WorkflowPendingActionSubjectBinding[];
    readonly deadline?: string;
    readonly timeoutPolicy: WorkflowPendingActionTimeoutPolicy;
    readonly state: WorkflowPendingActionState;
    readonly resolution?: WorkflowPendingActionResolution;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface WorkflowPendingActionContract {
    readonly actionType: string;
    readonly responderPolicy: WorkflowResponderPolicy;
    readonly responseSchema: WorkflowVersionRef;
    readonly authorityRequirement?: string;
    readonly blockingScope: readonly WorkflowEntityRef[];
    readonly artifactBindings?: readonly WorkflowArtifactRef[];
    readonly subjectBindings?: readonly WorkflowPendingActionSubjectBinding[];
    readonly deadline?: string;
    readonly timeoutPolicy?: WorkflowPendingActionTimeoutPolicy;
}
export interface WorkflowPendingActionResponseInput {
    readonly runId: string;
    readonly actionId: string;
    readonly expectedRevision: number;
    readonly requestId: string;
    readonly provenance: WorkflowResponseProvenance;
    readonly responseSchema: WorkflowVersionRef;
    readonly payload: unknown;
}
export interface WorkflowExternalSignal {
    readonly schema: typeof WORKFLOW_EXTERNAL_SIGNAL_SCHEMA;
    readonly version: 1;
    readonly signalId: string;
    readonly runId: string;
    readonly requestId: string;
    readonly principal: WorkflowPrincipal;
    readonly provenance: WorkflowResponseProvenance;
    readonly signalType: string;
    readonly payloadSchema: WorkflowVersionRef;
    readonly payload: unknown;
    readonly payloadHash: string;
    readonly expectedRunRevision: number;
    readonly createdAt: string;
}
export interface WorkflowExternalSignalInput {
    readonly runId: string;
    readonly expectedRunRevision: number;
    readonly requestId: string;
    readonly provenance: WorkflowResponseProvenance;
    readonly signalType: string;
    readonly payloadSchema: WorkflowVersionRef;
    readonly payload: unknown;
}
//# sourceMappingURL=types.d.ts.map