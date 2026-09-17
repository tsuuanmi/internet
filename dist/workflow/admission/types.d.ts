import type { WorkflowPrincipal } from "#internet/workflow/authorization";
export declare const WORKFLOW_ADMISSION_PROVENANCE: readonly ["user_explicit", "local_interpreted", "policy_default", "planner_derived", "system_observed"];
export type WorkflowAdmissionProvenance = (typeof WORKFLOW_ADMISSION_PROVENANCE)[number];
export declare const WORKFLOW_ADMISSION_STATES: readonly ["DRAFT", "PREFLIGHTED", "AWAITING_CONFIRMATION", "ACCEPTED", "ACTIVATING", "ACTIVATED"];
export type WorkflowAdmissionState = (typeof WORKFLOW_ADMISSION_STATES)[number];
export declare const WORKFLOW_ADMISSION_PREVIEW_STATUSES: readonly ["INCOMPLETE", "REJECTED", "READY", "CONFIRMATION_REQUIRED"];
export type WorkflowAdmissionPreviewStatus = (typeof WORKFLOW_ADMISSION_PREVIEW_STATUSES)[number];
export declare const WORKFLOW_ADMISSION_CONFIRMATION_LEVELS: readonly ["AUTO_SUBMIT", "LOCAL_CONFIRM", "USER_CONFIRM"];
export type WorkflowAdmissionConfirmationLevel = (typeof WORKFLOW_ADMISSION_CONFIRMATION_LEVELS)[number];
export declare const WORKFLOW_ADMISSION_SOURCE_KINDS: readonly ["user", "local_agent"];
export type WorkflowAdmissionSourceKind = (typeof WORKFLOW_ADMISSION_SOURCE_KINDS)[number];
export declare const WORKFLOW_ADMISSION_TARGET_KINDS: readonly ["workflow_job"];
export type WorkflowAdmissionTargetKind = (typeof WORKFLOW_ADMISSION_TARGET_KINDS)[number];
export interface ProvenancedValue<T> {
    readonly value: T;
    readonly provenance: WorkflowAdmissionProvenance;
    readonly uncertainty?: string;
}
export interface WorkflowAdmissionSource {
    readonly kind: WorkflowAdmissionSourceKind;
    readonly rawText: string;
    readonly provenance: "user_explicit" | "local_interpreted";
}
export interface WorkflowAdmissionTarget {
    readonly repository?: ProvenancedValue<string>;
    readonly baseRevision?: ProvenancedValue<string>;
}
export interface WorkflowAdmissionAuthority {
    readonly repositoryMutation?: ProvenancedValue<boolean>;
    readonly externalPublication?: ProvenancedValue<boolean>;
}
export interface WorkflowAdmissionTemporalHints {
    readonly deadline?: ProvenancedValue<string>;
    readonly duration?: ProvenancedValue<string>;
}
export interface WorkflowAdmissionBudgetHints {
    readonly maxWallClockMs?: ProvenancedValue<number>;
    readonly maxCostUsd?: ProvenancedValue<number>;
}
export interface WorkflowAdmissionDraftInput {
    readonly source: WorkflowAdmissionSource;
    readonly profileHint?: ProvenancedValue<string>;
    readonly target?: WorkflowAdmissionTarget;
    readonly constraints?: readonly ProvenancedValue<string>[];
    readonly authority?: WorkflowAdmissionAuthority;
    readonly autonomy?: ProvenancedValue<"autonomous_until_external_dependency" | "interactive">;
    readonly temporal?: WorkflowAdmissionTemporalHints;
    readonly budget?: WorkflowAdmissionBudgetHints;
    readonly deliverables?: readonly ProvenancedValue<string>[];
    readonly uncertainties?: readonly {
        readonly field: string;
        readonly description: string;
    }[];
}
export interface WorkflowAdmissionDraft extends WorkflowAdmissionDraftInput {
    readonly schema: "@tsuuanmi/internet-workflow-admission-draft";
    readonly version: 1;
    readonly requestId: string;
}
export interface AdmissionDefault {
    readonly field: string;
    readonly value: unknown;
    readonly provenance: "policy_default";
}
export interface AdmissionConfirmationReason {
    readonly field: string;
    readonly reason: string;
    readonly proposedValue?: unknown;
    readonly provenance?: WorkflowAdmissionProvenance;
}
export interface AdmissionPreview {
    readonly schema: "@tsuuanmi/internet-workflow-admission-preview";
    readonly version: 1;
    readonly admissionId: string;
    readonly draftHash: string;
    readonly status: WorkflowAdmissionPreviewStatus;
    readonly profile: {
        readonly id: string;
        readonly version: string;
    };
    readonly defaults: readonly AdmissionDefault[];
    readonly unresolved: readonly string[];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    readonly confirmation: {
        readonly level: WorkflowAdmissionConfirmationLevel;
        readonly reasons: readonly AdmissionConfirmationReason[];
    };
}
export interface AcceptedAdmissionSpec {
    readonly schema: "@tsuuanmi/internet-workflow-admission-spec";
    readonly version: 1;
    readonly admissionId: string;
    readonly draftHash: string;
    readonly profile: {
        readonly id: string;
        readonly version: string;
    };
    readonly defaults: readonly AdmissionDefault[];
    readonly draft: WorkflowAdmissionDraft;
    readonly acceptedAt: string;
}
export interface AdmissionConfirmationReceipt {
    readonly schema: "@tsuuanmi/internet-workflow-admission-confirmation";
    readonly version: 1;
    readonly level: WorkflowAdmissionConfirmationLevel;
    readonly principal: WorkflowPrincipal;
    readonly provenance: "user_explicit" | "local_interpreted" | "policy_default";
    readonly draftHash: string;
    readonly confirmedAt: string;
}
export interface AdmissionActivationTarget {
    readonly targetKind: WorkflowAdmissionTargetKind;
    readonly targetId: string;
}
export interface AdmissionActivationIntent extends AdmissionActivationTarget {
    readonly schema: "@tsuuanmi/internet-workflow-admission-activation-intent";
    readonly version: 1;
    readonly acceptedSpecHash: string;
    readonly startedAt: string;
}
export interface AdmissionActivationReceipt extends AdmissionActivationTarget {
    readonly schema: "@tsuuanmi/internet-workflow-admission-activation";
    readonly version: 1;
    readonly acceptedSpecHash: string;
    readonly activatedAt: string;
}
export interface WorkflowAdmissionRecord {
    readonly schema: "@tsuuanmi/internet-workflow-admission";
    readonly version: 1;
    readonly revision: number;
    readonly admissionId: string;
    readonly owner: WorkflowPrincipal;
    readonly state: WorkflowAdmissionState;
    readonly draft: WorkflowAdmissionDraft;
    readonly draftHash: string;
    readonly preview?: AdmissionPreview;
    readonly confirmation?: AdmissionConfirmationReceipt;
    readonly acceptedSpec?: AcceptedAdmissionSpec;
    readonly acceptedSpecHash?: string;
    readonly activationIntent?: AdmissionActivationIntent;
    readonly activation?: AdmissionActivationReceipt;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface AdmissionConfirmationInput {
    readonly expectedDraftHash: string;
    readonly provenance: "user_explicit" | "local_interpreted";
}
//# sourceMappingURL=types.d.ts.map