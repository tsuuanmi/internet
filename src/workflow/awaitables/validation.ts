import { hashCanonicalJson } from "#internet/core/canonical-json";
import {
	WORKFLOW_EXTERNAL_EVENT_SCHEMA,
	WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA,
	WORKFLOW_EXTERNAL_EVENT_WAIT_STATES,
	WORKFLOW_TIMER_SCHEMA,
	WORKFLOW_TIMER_STATES,
	type WorkflowExternalEvent,
	type WorkflowExternalEventWait,
	type WorkflowTimer,
} from "#internet/workflow/awaitables/types";

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid workflow awaitable");
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) throw new Error(`invalid ${label}`);
}

function hex(value: unknown, length: number, label: string): asserts value is string {
	if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new Error(`invalid ${label}`);
	}
}

function revision(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`invalid ${label}`);
}

function timestamp(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`invalid ${label}`);
}

function versionRef(value: unknown, label: string): void {
	const item = record(value);
	text(item.id, `${label} id`);
	text(item.version, `${label} version`);
}

function artifactRef(value: unknown, label: string): void {
	const ref = record(value);
	hex(ref.runId, 32, `${label} run id`);
	hex(ref.artifactId, 64, `${label} artifact id`);
}

export function parseWorkflowTimer(value: unknown): WorkflowTimer {
	const timer = record(value);
	if (timer.schema !== WORKFLOW_TIMER_SCHEMA || timer.version !== 1) throw new Error("unsupported workflow Timer schema");
	revision(timer.revision, "workflow Timer revision");
	hex(timer.timerId, 32, "workflow Timer id");
	hex(timer.runId, 32, "workflow Timer run id");
	artifactRef(timer.causedBy, "workflow Timer cause");
	if ((timer.causedBy as { runId: string }).runId !== timer.runId) {
		throw new Error("workflow Timer cause must belong to the same run");
	}
	text(timer.timerType, "workflow Timer type");
	timestamp(timer.deadline, "workflow Timer deadline");
	if (typeof timer.state !== "string" || !WORKFLOW_TIMER_STATES.includes(timer.state as WorkflowTimer["state"])) {
		throw new Error("invalid workflow Timer state");
	}
	if (timer.firedAt !== undefined) timestamp(timer.firedAt, "workflow Timer firedAt");
	if ((timer.state === "FIRED") !== (timer.firedAt !== undefined)) {
		throw new Error("workflow fired Timer must have exactly one firedAt timestamp");
	}
	timestamp(timer.createdAt, "workflow Timer createdAt");
	timestamp(timer.updatedAt, "workflow Timer updatedAt");
	return value as WorkflowTimer;
}

export function parseWorkflowExternalEventWait(value: unknown): WorkflowExternalEventWait {
	const wait = record(value);
	if (wait.schema !== WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA || wait.version !== 1) {
		throw new Error("unsupported workflow ExternalEvent wait schema");
	}
	revision(wait.revision, "workflow ExternalEvent wait revision");
	hex(wait.waitId, 32, "workflow ExternalEvent wait id");
	hex(wait.runId, 32, "workflow ExternalEvent wait run id");
	artifactRef(wait.causedBy, "workflow ExternalEvent wait cause");
	if ((wait.causedBy as { runId: string }).runId !== wait.runId) {
		throw new Error("workflow ExternalEvent wait cause must belong to the same run");
	}
	text(wait.eventType, "workflow ExternalEvent wait type");
	text(wait.correlationKey, "workflow ExternalEvent correlation key");
	if (wait.payloadSchema !== undefined) versionRef(wait.payloadSchema, "workflow ExternalEvent wait payload schema");
	if (
		typeof wait.state !== "string" ||
		!WORKFLOW_EXTERNAL_EVENT_WAIT_STATES.includes(wait.state as WorkflowExternalEventWait["state"])
	) {
		throw new Error("invalid workflow ExternalEvent wait state");
	}
	if (wait.matchedEventId !== undefined) hex(wait.matchedEventId, 32, "workflow ExternalEvent matched event id");
	if ((wait.state === "MATCHED") !== (wait.matchedEventId !== undefined)) {
		throw new Error("workflow matched ExternalEvent wait must have exactly one event id");
	}
	timestamp(wait.createdAt, "workflow ExternalEvent wait createdAt");
	timestamp(wait.updatedAt, "workflow ExternalEvent wait updatedAt");
	return value as WorkflowExternalEventWait;
}

export function parseWorkflowExternalEvent(value: unknown): WorkflowExternalEvent {
	const event = record(value);
	if (event.schema !== WORKFLOW_EXTERNAL_EVENT_SCHEMA || event.version !== 1) {
		throw new Error("unsupported workflow ExternalEvent schema");
	}
	hex(event.eventId, 32, "workflow ExternalEvent id");
	hex(event.runId, 32, "workflow ExternalEvent run id");
	text(event.source, "workflow ExternalEvent source");
	text(event.sourceEventId, "workflow ExternalEvent source event id");
	text(event.eventType, "workflow ExternalEvent type");
	text(event.correlationKey, "workflow ExternalEvent correlation key");
	versionRef(event.payloadSchema, "workflow ExternalEvent payload schema");
	hex(event.payloadHash, 64, "workflow ExternalEvent payload hash");
	if (event.payloadHash !== hashCanonicalJson(event.payload)) {
		throw new Error("workflow ExternalEvent payload hash mismatch");
	}
	timestamp(event.occurredAt, "workflow ExternalEvent occurredAt");
	timestamp(event.receivedAt, "workflow ExternalEvent receivedAt");
	return value as WorkflowExternalEvent;
}
