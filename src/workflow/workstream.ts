import { WORKFLOW_PRINCIPAL_KINDS, type WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";

export const WORKFLOW_WORKSTREAM_SCHEMA = "@tsuuanmi/internet-workflow-workstream" as const;

export interface WorkflowImportedArtifactRef {
	readonly source: WorkflowArtifactRef;
	readonly sourcePayloadHash: string;
	readonly sourceSchemaRef: WorkflowVersionRef;
	readonly imported: WorkflowArtifactRef;
}

export interface WorkflowContinuationLink {
	readonly sourceRunId: string;
	readonly childRunId: string;
	readonly childAdmissionId: string;
	readonly imports: readonly WorkflowImportedArtifactRef[];
	readonly createdAt: string;
}

export interface WorkflowWorkstream {
	readonly schema: typeof WORKFLOW_WORKSTREAM_SCHEMA;
	readonly version: 1;
	readonly revision: number;
	readonly workstreamId: string;
	readonly owner: WorkflowPrincipal;
	readonly title?: string;
	readonly runIds: readonly string[];
	readonly continuations: readonly WorkflowContinuationLink[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertText(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) throw new Error(`invalid ${label}`);
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
	if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new Error(`invalid ${label}`);
	}
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`invalid ${label}`);
}

function assertVersionRef(value: unknown, label: string): asserts value is WorkflowVersionRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertText(value.id, `${label} id`);
	assertText(value.version, `${label} version`);
}

function assertArtifactRef(value: unknown, label: string): asserts value is WorkflowArtifactRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertHex(value.runId, 32, `${label} run id`);
	assertHex(value.artifactId, 64, `${label} artifact id`);
}

function assertPrincipal(value: unknown): asserts value is WorkflowPrincipal {
	if (!isRecord(value) || typeof value.kind !== "string" || typeof value.id !== "string") {
		throw new Error("invalid workflow Workstream owner");
	}
	if (!WORKFLOW_PRINCIPAL_KINDS.includes(value.kind as WorkflowPrincipal["kind"]) || value.id.trim() === "") {
		throw new Error("invalid workflow Workstream owner");
	}
}

function assertImport(value: unknown, childRunId: string): asserts value is WorkflowImportedArtifactRef {
	if (!isRecord(value)) throw new Error("invalid workflow continuation import");
	assertArtifactRef(value.source, "workflow continuation source Artifact");
	assertHex(value.sourcePayloadHash, 64, "workflow continuation source payload hash");
	assertVersionRef(value.sourceSchemaRef, "workflow continuation source schema");
	assertArtifactRef(value.imported, "workflow continuation imported Artifact");
	if (value.imported.runId !== childRunId) {
		throw new Error("workflow continuation imported Artifact must belong to the child run");
	}
}

function assertContinuation(value: unknown, runIds: ReadonlySet<string>): asserts value is WorkflowContinuationLink {
	if (!isRecord(value)) throw new Error("invalid workflow continuation link");
	assertHex(value.sourceRunId, 32, "workflow continuation source run id");
	assertHex(value.childRunId, 32, "workflow continuation child run id");
	assertHex(value.childAdmissionId, 32, "workflow continuation child admission id");
	if (!runIds.has(value.sourceRunId) || !runIds.has(value.childRunId)) {
		throw new Error("workflow continuation runs must belong to the Workstream");
	}
	if (value.sourceRunId === value.childRunId) throw new Error("workflow continuation source and child runs must differ");
	if (!Array.isArray(value.imports)) throw new Error("invalid workflow continuation imports");
	const sources = new Set<string>();
	const imported = new Set<string>();
	for (const item of value.imports) {
		assertImport(item, value.childRunId);
		const source = item as WorkflowImportedArtifactRef;
		if (source.source.runId !== value.sourceRunId) {
			throw new Error("workflow continuation source Artifact must belong to the source run");
		}
		const sourceKey = `${source.source.runId}:${source.source.artifactId}`;
		const importedKey = `${source.imported.runId}:${source.imported.artifactId}`;
		if (sources.has(sourceKey) || imported.has(importedKey)) {
			throw new Error("duplicate workflow continuation Artifact import");
		}
		sources.add(sourceKey);
		imported.add(importedKey);
	}
	assertTimestamp(value.createdAt, "workflow continuation timestamp");
}

export function parseWorkflowWorkstream(value: unknown): WorkflowWorkstream {
	if (
		!isRecord(value) ||
		value.schema !== WORKFLOW_WORKSTREAM_SCHEMA ||
		value.version !== 1 ||
		!Number.isSafeInteger(value.revision) ||
		(value.revision as number) < 1
	) {
		throw new Error("unsupported workflow Workstream schema");
	}
	assertHex(value.workstreamId, 32, "workflow Workstream id");
	assertPrincipal(value.owner);
	if (value.title !== undefined) assertText(value.title, "workflow Workstream title");
	if (!Array.isArray(value.runIds)) throw new Error("invalid workflow Workstream run ids");
	const runIds = new Set<string>();
	for (const runId of value.runIds) {
		assertHex(runId, 32, "workflow Workstream run id");
		if (runIds.has(runId)) throw new Error(`duplicate workflow Workstream run ${runId}`);
		runIds.add(runId);
	}
	if (runIds.size === 0) throw new Error("workflow Workstream requires at least one run");
	if (!Array.isArray(value.continuations)) throw new Error("invalid workflow Workstream continuations");
	const children = new Set<string>();
	for (const continuation of value.continuations) {
		assertContinuation(continuation, runIds);
		const childRunId = (continuation as WorkflowContinuationLink).childRunId;
		if (children.has(childRunId)) throw new Error(`duplicate workflow continuation child run ${childRunId}`);
		children.add(childRunId);
	}
	assertTimestamp(value.createdAt, "workflow Workstream creation timestamp");
	assertTimestamp(value.updatedAt, "workflow Workstream update timestamp");
	if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
		throw new Error("workflow Workstream updatedAt precedes createdAt");
	}
	return value as unknown as WorkflowWorkstream;
}
