import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import {
	WORKFLOW_ARTIFACT_LINEAGE_RELATIONS,
	type WorkflowArtifact,
	type WorkflowArtifactLineage,
	type WorkflowInputBundle,
	type WorkflowVersionRef,
	type WorkflowWorkItem,
} from "#internet/workflow/kernel/types";
import {
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	WORKFLOW_SEMANTIC_SCHEMA_REFS,
	type WorkflowSemanticArtifactType,
	type WorkflowSemanticPayload,
} from "#internet/workflow/semantic/types";
import { parseWorkflowSemanticPayload } from "#internet/workflow/semantic/validation";

const SEMANTIC_TYPES = new Set<string>(Object.values(WORKFLOW_SEMANTIC_ARTIFACT_TYPES));

export interface WorkflowSemanticArtifactDraft {
	readonly type: WorkflowSemanticArtifactType;
	readonly payload: WorkflowSemanticPayload;
	readonly lineage?: readonly WorkflowArtifactLineage[];
}

export interface WorkflowSemanticExecutionResult {
	readonly executionId: string;
	readonly workItemId: string;
	readonly inputBundleId: string;
	readonly artifacts: readonly WorkflowSemanticArtifactDraft[];
	readonly receiptIds: readonly string[];
}

export interface WorkflowSemanticPromotionContext {
	readonly workItem: WorkflowWorkItem;
	readonly inputBundle: WorkflowInputBundle;
	readonly capability: WorkflowCapabilityDescriptor;
	readonly artifactStore: WorkflowArtifactStore;
}

export interface WorkflowSemanticPromotionResult {
	readonly artifacts: readonly WorkflowArtifact[];
	readonly receiptIds: readonly string[];
}

function assertText(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) throw new Error(`invalid ${label}`);
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
	if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value))
		throw new Error(`invalid ${label}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSemanticType(value: unknown): asserts value is WorkflowSemanticArtifactType {
	if (typeof value !== "string" || !SEMANTIC_TYPES.has(value)) throw new Error("invalid workflow semantic artifact type");
}

function parseLineage(value: unknown): readonly WorkflowArtifactLineage[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error("invalid workflow semantic artifact lineage");
	const seen = new Set<string>();
	return value.map((item) => {
		if (!isRecord(item) || typeof item.relation !== "string")
			throw new Error("invalid workflow semantic artifact lineage");
		if (!WORKFLOW_ARTIFACT_LINEAGE_RELATIONS.includes(item.relation as WorkflowArtifactLineage["relation"]))
			throw new Error("invalid workflow semantic artifact lineage relation");
		if (!isRecord(item.artifact)) throw new Error("invalid workflow semantic artifact lineage reference");
		assertHex(item.artifact.runId, 32, "workflow semantic artifact lineage run id");
		assertHex(item.artifact.artifactId, 64, "workflow semantic artifact lineage artifact id");
		const lineage = item as unknown as WorkflowArtifactLineage;
		const key = `${lineage.relation}:${lineage.artifact.runId}:${lineage.artifact.artifactId}`;
		if (seen.has(key)) throw new Error(`duplicate workflow semantic artifact lineage ${key}`);
		seen.add(key);
		return lineage;
	});
}

function schemaRef(type: WorkflowSemanticArtifactType): WorkflowVersionRef {
	switch (type) {
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.objective;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.acceptanceCriteria;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.plan:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.plan;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.need;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.finding;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.evidence;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.criterionAssessment:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.criterionAssessment;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.report;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.delivery;
		case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.userFeedback:
			return WORKFLOW_SEMANTIC_SCHEMA_REFS.userFeedback;
	}
}

function sameVersionRef(left: WorkflowVersionRef, right: WorkflowVersionRef): boolean {
	return left.id === right.id && left.version === right.version;
}

function assertPromotionContext(context: WorkflowSemanticPromotionContext): void {
	const { workItem, inputBundle, capability } = context;
	if (workItem.runId !== inputBundle.runId) throw new Error("workflow semantic promotion run mismatch");
	if (workItem.workItemId !== inputBundle.workItemId) throw new Error("workflow semantic promotion work item mismatch");
	if (workItem.inputBundleId !== inputBundle.bundleId) throw new Error("workflow semantic promotion InputBundle mismatch");
	if (!sameVersionRef(workItem.capability, capability))
		throw new Error("workflow semantic promotion capability does not match WorkItem");
	if (!sameVersionRef(inputBundle.capability, capability))
		throw new Error("workflow semantic promotion capability does not match InputBundle");
}

export function parseWorkflowSemanticExecutionResult(value: unknown): WorkflowSemanticExecutionResult {
	if (!isRecord(value)) throw new Error("invalid workflow semantic execution result");
	assertText(value.executionId, "workflow semantic execution id");
	assertHex(value.workItemId, 32, "workflow semantic execution work item id");
	assertHex(value.inputBundleId, 64, "workflow semantic execution input bundle id");
	if (!Array.isArray(value.artifacts)) throw new Error("invalid workflow semantic execution artifacts");
	const artifacts = value.artifacts.map((item) => {
		if (!isRecord(item)) throw new Error("invalid workflow semantic artifact draft");
		assertSemanticType(item.type);
		return {
			type: item.type,
			payload: parseWorkflowSemanticPayload(item.type, item.payload),
			lineage: parseLineage(item.lineage),
		};
	});
	if (!Array.isArray(value.receiptIds)) throw new Error("invalid workflow semantic execution receipt ids");
	const receiptIds = value.receiptIds.map((receiptId) => {
		assertText(receiptId, "workflow semantic execution receipt id");
		return receiptId;
	});
	if (new Set(receiptIds).size !== receiptIds.length)
		throw new Error("duplicate workflow semantic execution receipt id");
	return {
		executionId: value.executionId,
		workItemId: value.workItemId,
		inputBundleId: value.inputBundleId,
		artifacts,
		receiptIds,
	};
}

export function promoteWorkflowSemanticResult(
	context: WorkflowSemanticPromotionContext,
	resultValue: unknown,
): WorkflowSemanticPromotionResult {
	assertPromotionContext(context);
	const result = parseWorkflowSemanticExecutionResult(resultValue);
	if (result.workItemId !== context.workItem.workItemId) throw new Error("workflow semantic result work item mismatch");
	if (result.inputBundleId !== context.inputBundle.bundleId) throw new Error("workflow semantic result input bundle mismatch");
	if (!context.workItem.executionIds.includes(result.executionId)) throw new Error("workflow semantic result execution mismatch");

	const allowedArtifacts = new Set(context.capability.producedArtifactTypes);
	for (const draft of result.artifacts) {
		if (!allowedArtifacts.has(draft.type))
			throw new Error(`workflow capability cannot produce artifact type ${draft.type}`);
	}

	const artifacts = result.artifacts.map((draft) =>
		context.artifactStore.create({
			runId: context.workItem.runId,
			type: draft.type,
			schemaRef: schemaRef(draft.type),
			producer: { kind: "work_item", id: context.workItem.workItemId },
			inputBundleId: context.inputBundle.bundleId,
			lineage: draft.lineage,
			payload: draft.payload,
		}),
	);
	return { artifacts, receiptIds: result.receiptIds };
}
