import type { WorkflowPrincipal } from "#internet/workflow/authorization";

export const WORKFLOW_RUN_SCHEMA = "@tsuuanmi/internet-workflow-run" as const;
export const WORKFLOW_ARTIFACT_SCHEMA = "@tsuuanmi/internet-workflow-artifact" as const;
export const WORKFLOW_WORK_ITEM_SCHEMA = "@tsuuanmi/internet-workflow-work-item" as const;
export const WORKFLOW_INPUT_BUNDLE_SCHEMA = "@tsuuanmi/internet-workflow-input-bundle" as const;

export const WORKFLOW_RUN_LIFECYCLES = [
	"CREATED",
	"ACTIVE",
	"WAITING_EXTERNAL",
	"BLOCKED",
	"COMPLETED",
	"CANCELLED",
] as const;
export type WorkflowRunLifecycle = (typeof WORKFLOW_RUN_LIFECYCLES)[number];

export const WORKFLOW_WORK_ITEM_STATES = [
	"PENDING",
	"READY",
	"RUNNING",
	"COMPLETED",
	"FAILED",
	"CANCELLED",
	"FENCED",
] as const;
export type WorkflowWorkItemState = (typeof WORKFLOW_WORK_ITEM_STATES)[number];

export const WORKFLOW_SIDE_EFFECT_CLASSES = [
	"READ_ONLY",
	"CONTROLLED_MUTATION",
	"EXTERNAL_MUTATION",
	"HUMAN_AUTHORITY",
] as const;
export type WorkflowSideEffectClass = (typeof WORKFLOW_SIDE_EFFECT_CLASSES)[number];

export const WORKFLOW_ARTIFACT_LINEAGE_RELATIONS = [
	"derived_from",
	"supports",
	"contradicts",
	"resolves",
	"supersedes",
	"invalidates",
	"consumes",
	"continues_from",
	"validates",
] as const;
export type WorkflowArtifactLineageRelation = (typeof WORKFLOW_ARTIFACT_LINEAGE_RELATIONS)[number];

export interface WorkflowVersionRef {
	readonly id: string;
	readonly version: string;
}

export interface WorkflowDefinitionBindings {
	readonly profile: WorkflowVersionRef;
	readonly policy: WorkflowVersionRef;
	readonly capabilities: readonly WorkflowVersionRef[];
	readonly schemas: readonly WorkflowVersionRef[];
	readonly projection: WorkflowVersionRef;
	readonly agentDefinitions?: readonly WorkflowVersionRef[];
}

export interface WorkflowRun {
	readonly schema: typeof WORKFLOW_RUN_SCHEMA;
	readonly version: 1;
	readonly revision: number;
	readonly runId: string;
	readonly admissionId: string;
	readonly owner: WorkflowPrincipal;
	readonly lifecycle: WorkflowRunLifecycle;
	readonly definitions: WorkflowDefinitionBindings;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkflowEntityRef {
	readonly kind: string;
	readonly id: string;
}

export interface WorkflowArtifactRef {
	readonly runId: string;
	readonly artifactId: string;
}

export interface WorkflowArtifactLineage {
	readonly relation: WorkflowArtifactLineageRelation;
	readonly artifact: WorkflowArtifactRef;
}

export interface WorkflowArtifactProducer extends WorkflowEntityRef {
	readonly kind: "work_item" | "runtime" | "external_import";
}

export interface WorkflowArtifact {
	readonly schema: typeof WORKFLOW_ARTIFACT_SCHEMA;
	readonly version: 1;
	readonly artifactId: string;
	readonly runId: string;
	readonly type: string;
	readonly schemaRef: WorkflowVersionRef;
	readonly producer: WorkflowArtifactProducer;
	readonly inputBundleId?: string;
	readonly lineage: readonly WorkflowArtifactLineage[];
	readonly payload: unknown;
	readonly payloadHash: string;
	readonly createdAt: string;
}

export interface WorkflowWorkItem {
	readonly schema: typeof WORKFLOW_WORK_ITEM_SCHEMA;
	readonly version: 1;
	readonly revision: number;
	readonly workItemId: string;
	readonly runId: string;
	readonly needArtifact: WorkflowArtifactRef;
	readonly needId: string;
	readonly requestOwner: WorkflowEntityRef;
	readonly capability: WorkflowVersionRef;
	readonly sideEffect: WorkflowSideEffectClass;
	readonly state: WorkflowWorkItemState;
	readonly inputBundleId?: string;
	readonly authorityRef?: string;
	readonly budgetRef?: string;
	readonly executionIds: readonly string[];
	readonly resultArtifactIds: readonly string[];
	readonly receiptIds: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkflowInputFact {
	readonly name: string;
	readonly value: unknown;
}

export interface WorkflowInputBundle {
	readonly schema: typeof WORKFLOW_INPUT_BUNDLE_SCHEMA;
	readonly version: 1;
	readonly bundleId: string;
	readonly runId: string;
	readonly workItemId: string;
	readonly capability: WorkflowVersionRef;
	readonly projection: WorkflowVersionRef;
	readonly artifacts: readonly WorkflowArtifactRef[];
	readonly facts: readonly WorkflowInputFact[];
	readonly createdAt: string;
}
