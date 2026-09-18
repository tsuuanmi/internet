import { WORKFLOW_PRINCIPAL_KINDS, type WorkflowPrincipal } from "#internet/workflow/authorization";
import {
	workflowArtifactId,
	workflowArtifactPayloadHash,
	workflowInputBundleId,
} from "#internet/workflow/kernel/identity";
import {
	WORKFLOW_ARTIFACT_LINEAGE_RELATIONS,
	WORKFLOW_ARTIFACT_SCHEMA,
	WORKFLOW_INPUT_BUNDLE_SCHEMA,
	WORKFLOW_RUN_LIFECYCLES,
	WORKFLOW_RUN_SCHEMA,
	WORKFLOW_SIDE_EFFECT_CLASSES,
	WORKFLOW_WORK_ITEM_SCHEMA,
	WORKFLOW_WORK_ITEM_STATES,
	type WorkflowArtifact,
	type WorkflowArtifactLineage,
	type WorkflowArtifactProducer,
	type WorkflowArtifactRef,
	type WorkflowDefinitionBindings,
	type WorkflowInputBundle,
	type WorkflowInputFact,
	type WorkflowRun,
	type WorkflowVersionRef,
	type WorkflowWorkItem,
} from "#internet/workflow/kernel/types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertText(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) throw new Error(`invalid ${label}`);
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
	if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new Error(`invalid ${label}`);
	}
}

function assertRevision(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`invalid ${label}`);
}

function assertPrincipal(value: unknown): asserts value is WorkflowPrincipal {
	if (!isRecord(value) || typeof value.kind !== "string" || typeof value.id !== "string")
		throw new Error("invalid workflow run owner");
	if (!WORKFLOW_PRINCIPAL_KINDS.includes(value.kind as WorkflowPrincipal["kind"]) || value.id.trim() === "")
		throw new Error("invalid workflow run owner");
}

function assertVersionRef(value: unknown, label: string): asserts value is WorkflowVersionRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertText(value.id, `${label} id`);
	assertText(value.version, `${label} version`);
}

function assertUniqueVersionRefs(value: unknown, label: string): asserts value is readonly WorkflowVersionRef[] {
	if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
	const ids = new Set<string>();
	for (const item of value) {
		assertVersionRef(item, label);
		if (ids.has(item.id)) throw new Error(`duplicate ${label} id ${item.id}`);
		ids.add(item.id);
	}
}

function assertDefinitions(value: unknown): asserts value is WorkflowDefinitionBindings {
	if (!isRecord(value)) throw new Error("invalid workflow definition bindings");
	assertVersionRef(value.profile, "workflow profile binding");
	assertVersionRef(value.policy, "workflow policy binding");
	assertVersionRef(value.projection, "workflow projection binding");
	assertUniqueVersionRefs(value.capabilities, "workflow capability binding");
	assertUniqueVersionRefs(value.schemas, "workflow schema binding");
	if (value.agentDefinitions !== undefined) {
		assertUniqueVersionRefs(value.agentDefinitions, "workflow agent definition binding");
	}
}

function assertEntityRef(value: unknown, label: string): void {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertText(value.kind, `${label} kind`);
	assertText(value.id, `${label} id`);
}

function assertArtifactProducer(value: unknown): asserts value is WorkflowArtifactProducer {
	if (!isRecord(value) || typeof value.kind !== "string") throw new Error("invalid workflow artifact producer");
	if (!["work_item", "runtime", "external_import"].includes(value.kind))
		throw new Error("invalid workflow artifact producer");
	assertText(value.id, "workflow artifact producer id");
}

function assertArtifactRef(value: unknown): asserts value is WorkflowArtifactRef {
	if (!isRecord(value)) throw new Error("invalid workflow artifact reference");
	assertHex(value.runId, 32, "workflow artifact reference run id");
	assertHex(value.artifactId, 64, "workflow artifact reference id");
}

function assertArtifactRefs(value: unknown): asserts value is readonly WorkflowArtifactRef[] {
	if (!Array.isArray(value)) throw new Error("invalid workflow input artifacts");
	const seen = new Set<string>();
	for (const item of value) {
		assertArtifactRef(item);
		const key = `${item.runId}:${item.artifactId}`;
		if (seen.has(key)) throw new Error(`duplicate workflow input artifact ${key}`);
		seen.add(key);
	}
}

function assertLineage(value: unknown): asserts value is readonly WorkflowArtifactLineage[] {
	if (!Array.isArray(value)) throw new Error("invalid workflow artifact lineage");
	const seen = new Set<string>();
	for (const item of value) {
		if (!isRecord(item) || typeof item.relation !== "string") throw new Error("invalid workflow artifact lineage");
		if (!WORKFLOW_ARTIFACT_LINEAGE_RELATIONS.includes(item.relation as WorkflowArtifactLineage["relation"]))
			throw new Error("invalid workflow artifact lineage relation");
		assertArtifactRef(item.artifact);
		const key = `${item.relation}:${item.artifact.runId}:${item.artifact.artifactId}`;
		if (seen.has(key)) throw new Error(`duplicate workflow artifact lineage ${key}`);
		seen.add(key);
	}
}

function assertStringList(value: unknown, label: string): asserts value is readonly string[] {
	if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
	const seen = new Set<string>();
	for (const item of value) {
		assertText(item, label);
		if (seen.has(item)) throw new Error(`duplicate ${label} ${item}`);
		seen.add(item);
	}
}

function assertInputFacts(value: unknown): asserts value is readonly WorkflowInputFact[] {
	if (!Array.isArray(value)) throw new Error("invalid workflow input facts");
	const names = new Set<string>();
	for (const item of value) {
		if (!isRecord(item) || !Object.hasOwn(item, "value") || item.value === undefined)
			throw new Error("invalid workflow input fact");
		assertText(item.name, "workflow input fact name");
		if (names.has(item.name)) throw new Error(`duplicate workflow input fact ${item.name}`);
		names.add(item.name);
	}
}

export function parseWorkflowRun(value: unknown): WorkflowRun {
	if (!isRecord(value) || value.schema !== WORKFLOW_RUN_SCHEMA || value.version !== 1)
		throw new Error("unsupported workflow run schema");
	assertRevision(value.revision, "workflow run revision");
	assertHex(value.runId, 32, "workflow run id");
	assertHex(value.admissionId, 32, "workflow run admission id");
	assertPrincipal(value.owner);
	if (
		typeof value.lifecycle !== "string" ||
		!WORKFLOW_RUN_LIFECYCLES.includes(value.lifecycle as WorkflowRun["lifecycle"])
	)
		throw new Error("invalid workflow run lifecycle");
	assertDefinitions(value.definitions);
	if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt))
		throw new Error("invalid workflow run timestamps");
	return value as unknown as WorkflowRun;
}

export function parseWorkflowArtifact(value: unknown): WorkflowArtifact {
	if (!isRecord(value) || value.schema !== WORKFLOW_ARTIFACT_SCHEMA || value.version !== 1)
		throw new Error("unsupported workflow artifact schema");
	assertHex(value.artifactId, 64, "workflow artifact id");
	assertHex(value.runId, 32, "workflow artifact run id");
	assertText(value.type, "workflow artifact type");
	assertVersionRef(value.schemaRef, "workflow artifact schema reference");
	assertArtifactProducer(value.producer);
	if (value.inputBundleId !== undefined) assertHex(value.inputBundleId, 64, "workflow artifact input bundle id");
	assertLineage(value.lineage);
	assertHex(value.payloadHash, 64, "workflow artifact payload hash");
	if (workflowArtifactPayloadHash(value.payload) !== value.payloadHash)
		throw new Error("workflow artifact payload hash mismatch");
	if (!isTimestamp(value.createdAt)) throw new Error("invalid workflow artifact timestamp");
	const expectedId = workflowArtifactId({
		runId: value.runId,
		type: value.type,
		schemaRef: value.schemaRef,
		producer: value.producer,
		inputBundleId: value.inputBundleId as string | undefined,
		lineage: value.lineage,
		payloadHash: value.payloadHash,
	});
	if (value.artifactId !== expectedId) throw new Error("workflow artifact id does not match content identity");
	return value as unknown as WorkflowArtifact;
}

export function parseWorkflowWorkItem(value: unknown): WorkflowWorkItem {
	if (!isRecord(value) || value.schema !== WORKFLOW_WORK_ITEM_SCHEMA || value.version !== 1)
		throw new Error("unsupported workflow work item schema");
	assertRevision(value.revision, "workflow work item revision");
	assertHex(value.workItemId, 32, "workflow work item id");
	assertHex(value.runId, 32, "workflow work item run id");
	assertArtifactRef(value.needArtifact);
	if (value.needArtifact.runId !== value.runId)
		throw new Error("workflow work item Need artifact must belong to the same run");
	assertText(value.needId, "workflow work item need id");
	assertEntityRef(value.requestOwner, "workflow work item request owner");
	assertVersionRef(value.capability, "workflow work item capability");
	if (
		typeof value.sideEffect !== "string" ||
		!WORKFLOW_SIDE_EFFECT_CLASSES.includes(value.sideEffect as WorkflowWorkItem["sideEffect"])
	)
		throw new Error("invalid workflow work item side-effect class");
	if (typeof value.state !== "string" || !WORKFLOW_WORK_ITEM_STATES.includes(value.state as WorkflowWorkItem["state"]))
		throw new Error("invalid workflow work item state");
	if (value.inputBundleId !== undefined) assertHex(value.inputBundleId, 64, "workflow work item input bundle id");
	if (!["PENDING", "CANCELLED"].includes(value.state) && value.inputBundleId === undefined)
		throw new Error("workflow work item state requires an input bundle");
	if (value.authorityRef !== undefined) assertText(value.authorityRef, "workflow work item authority reference");
	if (value.budgetRef !== undefined) assertText(value.budgetRef, "workflow work item budget reference");
	assertStringList(value.executionIds, "workflow work item execution id");
	assertStringList(value.resultArtifactIds, "workflow work item result artifact id");
	for (const artifactId of value.resultArtifactIds) assertHex(artifactId, 64, "workflow work item result artifact id");
	assertStringList(value.receiptIds, "workflow work item receipt id");
	if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt))
		throw new Error("invalid workflow work item timestamps");
	return value as unknown as WorkflowWorkItem;
}

export function parseWorkflowInputBundle(value: unknown): WorkflowInputBundle {
	if (!isRecord(value) || value.schema !== WORKFLOW_INPUT_BUNDLE_SCHEMA || value.version !== 1)
		throw new Error("unsupported workflow input bundle schema");
	assertHex(value.bundleId, 64, "workflow input bundle id");
	assertHex(value.runId, 32, "workflow input bundle run id");
	assertHex(value.workItemId, 32, "workflow input bundle work item id");
	assertVersionRef(value.capability, "workflow input bundle capability");
	assertVersionRef(value.projection, "workflow input bundle projection");
	assertArtifactRefs(value.artifacts);
	assertInputFacts(value.facts);
	if (!isTimestamp(value.createdAt)) throw new Error("invalid workflow input bundle timestamp");
	const expectedId = workflowInputBundleId({
		runId: value.runId,
		workItemId: value.workItemId,
		capability: value.capability,
		projection: value.projection,
		artifacts: value.artifacts,
		facts: value.facts,
	});
	if (value.bundleId !== expectedId) throw new Error("workflow input bundle id does not match content identity");
	return value as unknown as WorkflowInputBundle;
}
