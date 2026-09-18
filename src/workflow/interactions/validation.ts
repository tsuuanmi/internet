import { hashCanonicalJson } from "#internet/core/canonical-json";
import { WORKFLOW_PRINCIPAL_KINDS, type WorkflowPrincipal } from "#internet/workflow/authorization";
import {
	WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA,
	WORKFLOW_PENDING_ACTION_SCHEMA,
	WORKFLOW_PENDING_ACTION_STATES,
	WORKFLOW_PENDING_ACTION_TIMEOUT_POLICIES,
	WORKFLOW_RESPONDER_POLICIES,
	WORKFLOW_RESPONSE_PROVENANCE,
	type WorkflowPendingAction,
	type WorkflowPendingActionResolution,
	type WorkflowPendingActionSubjectBinding,
} from "#internet/workflow/interactions/types";
import type { WorkflowArtifactRef, WorkflowEntityRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";

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

function assertPrincipal(value: unknown): asserts value is WorkflowPrincipal {
	if (!isRecord(value) || typeof value.kind !== "string" || typeof value.id !== "string") {
		throw new Error("invalid workflow PendingAction response principal");
	}
	if (!WORKFLOW_PRINCIPAL_KINDS.includes(value.kind as WorkflowPrincipal["kind"]) || value.id.trim() === "") {
		throw new Error("invalid workflow PendingAction response principal");
	}
}

function assertVersionRef(value: unknown, label: string): asserts value is WorkflowVersionRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertText(value.id, `${label} id`);
	assertText(value.version, `${label} version`);
}

function assertEntityRef(value: unknown, label: string): asserts value is WorkflowEntityRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertText(value.kind, `${label} kind`);
	assertText(value.id, `${label} id`);
}

function assertArtifactRef(value: unknown, runId: string, label: string): asserts value is WorkflowArtifactRef {
	if (!isRecord(value)) throw new Error(`invalid ${label}`);
	assertHex(value.runId, 32, `${label} run id`);
	assertHex(value.artifactId, 64, `${label} artifact id`);
	if (value.runId !== runId) throw new Error(`${label} must belong to the PendingAction run`);
}

function assertEntityRefs(value: unknown, label: string): asserts value is readonly WorkflowEntityRef[] {
	if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
	for (const item of value) assertEntityRef(item, label);
}

function assertArtifactRefs(value: unknown, runId: string): asserts value is readonly WorkflowArtifactRef[] {
	if (!Array.isArray(value)) throw new Error("invalid workflow PendingAction artifact bindings");
	const seen = new Set<string>();
	for (const item of value) {
		assertArtifactRef(item, runId, "workflow PendingAction artifact binding");
		const ref = item as WorkflowArtifactRef;
		const key = `${ref.runId}:${ref.artifactId}`;
		if (seen.has(key)) throw new Error(`duplicate workflow PendingAction artifact binding ${key}`);
		seen.add(key);
	}
}

function assertSubjectBindings(value: unknown): asserts value is readonly WorkflowPendingActionSubjectBinding[] {
	if (!Array.isArray(value)) throw new Error("invalid workflow PendingAction subject bindings");
	const seen = new Set<string>();
	for (const item of value) {
		if (!isRecord(item)) throw new Error("invalid workflow PendingAction subject binding");
		assertEntityRef(item.subject, "workflow PendingAction subject");
		assertText(item.version, "workflow PendingAction subject version");
		const subject = item.subject as WorkflowEntityRef;
		const key = `${subject.kind}:${subject.id}`;
		if (seen.has(key)) throw new Error(`duplicate workflow PendingAction subject binding ${key}`);
		seen.add(key);
	}
}

function parseResolution(value: unknown): WorkflowPendingActionResolution {
	if (!isRecord(value) || value.schema !== WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA || value.version !== 1) {
		throw new Error("unsupported workflow PendingAction response schema");
	}
	assertText(value.requestId, "workflow PendingAction response request id");
	assertPrincipal(value.principal);
	if (
		typeof value.provenance !== "string" ||
		!WORKFLOW_RESPONSE_PROVENANCE.includes(value.provenance as WorkflowPendingActionResolution["provenance"])
	) {
		throw new Error("invalid workflow PendingAction response provenance");
	}
	assertVersionRef(value.responseSchema, "workflow PendingAction response schema reference");
	assertHex(value.payloadHash, 64, "workflow PendingAction response payload hash");
	if (value.payloadHash !== hashCanonicalJson(value.payload)) {
		throw new Error("workflow PendingAction response payload hash mismatch");
	}
	assertTimestamp(value.respondedAt, "workflow PendingAction response timestamp");
	return value as unknown as WorkflowPendingActionResolution;
}

export function parseWorkflowPendingAction(value: unknown): WorkflowPendingAction {
	if (
		!isRecord(value) ||
		value.schema !== WORKFLOW_PENDING_ACTION_SCHEMA ||
		value.version !== 1 ||
		!Number.isSafeInteger(value.revision) ||
		(value.revision as number) < 1
	) {
		throw new Error("unsupported workflow PendingAction schema");
	}
	assertHex(value.actionId, 32, "workflow PendingAction id");
	assertHex(value.runId, 32, "workflow PendingAction run id");
	assertArtifactRef(value.causedBy, value.runId, "workflow PendingAction cause");
	assertEntityRef(value.requestOwner, "workflow PendingAction request owner");
	assertText(value.actionType, "workflow PendingAction type");
	assertText(value.prompt, "workflow PendingAction prompt");
	if (
		typeof value.responderPolicy !== "string" ||
		!WORKFLOW_RESPONDER_POLICIES.includes(value.responderPolicy as WorkflowPendingAction["responderPolicy"])
	) {
		throw new Error("invalid workflow PendingAction responder policy");
	}
	assertVersionRef(value.responseSchema, "workflow PendingAction response schema");
	if (value.authorityRequirement !== undefined) {
		assertText(value.authorityRequirement, "workflow PendingAction authority requirement");
	}
	assertEntityRefs(value.blockingScope, "workflow PendingAction blocking scope");
	assertArtifactRefs(value.artifactBindings, value.runId);
	assertSubjectBindings(value.subjectBindings);
	if (value.deadline !== undefined) assertTimestamp(value.deadline, "workflow PendingAction deadline");
	if (
		typeof value.timeoutPolicy !== "string" ||
		!WORKFLOW_PENDING_ACTION_TIMEOUT_POLICIES.includes(value.timeoutPolicy as WorkflowPendingAction["timeoutPolicy"])
	) {
		throw new Error("invalid workflow PendingAction timeout policy");
	}
	if (
		typeof value.state !== "string" ||
		!WORKFLOW_PENDING_ACTION_STATES.includes(value.state as WorkflowPendingAction["state"])
	) {
		throw new Error("invalid workflow PendingAction state");
	}
	const resolution = value.resolution === undefined ? undefined : parseResolution(value.resolution);
	if (value.state === "RESOLVED" && resolution === undefined) {
		throw new Error("resolved workflow PendingAction requires a response");
	}
	if (value.state !== "RESOLVED" && resolution !== undefined) {
		throw new Error(`workflow PendingAction ${value.state} cannot contain a response`);
	}
	assertTimestamp(value.createdAt, "workflow PendingAction creation timestamp");
	assertTimestamp(value.updatedAt, "workflow PendingAction update timestamp");
	if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
		throw new Error("workflow PendingAction updatedAt precedes createdAt");
	}
	return value as unknown as WorkflowPendingAction;
}
