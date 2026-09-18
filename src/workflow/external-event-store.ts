import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import {
	WORKFLOW_EXTERNAL_EVENT_SCHEMA,
	WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA,
	type WorkflowExternalEvent,
	type WorkflowExternalEventInput,
	type WorkflowExternalEventWait,
	type WorkflowExternalEventWaitContract,
} from "#internet/workflow/awaitables/types";
import { parseWorkflowExternalEvent, parseWorkflowExternalEventWait } from "#internet/workflow/awaitables/validation";
import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";

export class WorkflowExternalEventStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowExternalEventStoreError";
	}
}

function assertHex(value: string, length: number, label: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowExternalEventStoreError(`${label} must be ${String(length)} lowercase hex characters`);
	}
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowExternalEventStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		throw new WorkflowExternalEventStoreError(`${label} permissions must be 0600`);
	}
}

function sameSchema(left: WorkflowVersionRef | undefined, right: WorkflowVersionRef | undefined): boolean {
	return canonicalJson(left ?? null) === canonicalJson(right ?? null);
}

function waitMatchesEvent(wait: WorkflowExternalEventWait, event: WorkflowExternalEvent): boolean {
	return (
		wait.runId === event.runId &&
		wait.eventType === event.eventType &&
		wait.correlationKey === event.correlationKey &&
		(wait.payloadSchema === undefined || sameSchema(wait.payloadSchema, event.payloadSchema))
	);
}

export class WorkflowExternalEventStore {
	private readonly eventRoot: string;
	private readonly waitRoot: string;

	constructor(dataDir: string) {
		this.eventRoot = join(dataDir, "workflows", "external-events");
		this.waitRoot = join(dataDir, "workflows", "external-event-waits");
	}

	private eventRunDir(runId: string): string {
		assertHex(runId, 32, "workflow run id");
		return join(this.eventRoot, runId);
	}

	private waitRunDir(runId: string): string {
		assertHex(runId, 32, "workflow run id");
		return join(this.waitRoot, runId);
	}

	eventPathFor(runId: string, eventId: string): string {
		assertHex(eventId, 32, "workflow ExternalEvent id");
		return join(this.eventRunDir(runId), `${eventId}.json`);
	}

	waitPathFor(runId: string, waitId: string): string {
		assertHex(waitId, 32, "workflow ExternalEvent wait id");
		return join(this.waitRunDir(runId), `${waitId}.json`);
	}

	ingest(input: WorkflowExternalEventInput, now: () => number = Date.now): WorkflowExternalEvent {
		if (!Number.isFinite(Date.parse(input.occurredAt))) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent occurredAt is invalid");
		}
		const eventId = hashCanonicalJson({
			runId: input.runId,
			source: input.source,
			sourceEventId: input.sourceEventId,
		}).slice(0, 32);
		const receivedAt = new Date(now()).toISOString();
		const next: WorkflowExternalEvent = {
			schema: WORKFLOW_EXTERNAL_EVENT_SCHEMA,
			version: 1,
			eventId,
			runId: input.runId,
			source: input.source,
			sourceEventId: input.sourceEventId,
			eventType: input.eventType,
			correlationKey: input.correlationKey,
			payloadSchema: input.payloadSchema,
			payload: input.payload,
			payloadHash: hashCanonicalJson(input.payload),
			occurredAt: input.occurredAt,
			receivedAt,
		};
		const existing = this.getEvent(input.runId, eventId);
		if (existing !== undefined) {
			const normalizedExisting = { ...existing, receivedAt };
			if (canonicalJson(normalizedExisting) !== canonicalJson(next)) {
				throw new WorkflowExternalEventStoreError(
					`workflow ExternalEvent ${input.source}:${input.sourceEventId} was replayed with conflicting content`,
				);
			}
			return existing;
		}
		parseWorkflowExternalEvent(next);
		ensurePrivateDirectory(this.eventRunDir(input.runId));
		writePrivateJson(this.eventPathFor(input.runId, eventId), next);
		return next;
	}

	ensureWait(
		runId: string,
		causedBy: WorkflowArtifactRef,
		contract: WorkflowExternalEventWaitContract,
		now: () => number = Date.now,
	): WorkflowExternalEventWait {
		if (causedBy.runId !== runId) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent wait cause must belong to the same run");
		}
		const conflicting = this.listWaits(runId).find(
			(wait) =>
				wait.causedBy.artifactId === causedBy.artifactId &&
				(wait.eventType !== contract.eventType ||
					wait.correlationKey !== contract.correlationKey ||
					!sameSchema(wait.payloadSchema, contract.payloadSchema)),
		);
		if (conflicting !== undefined) {
			throw new WorkflowExternalEventStoreError(
				`workflow Need ${causedBy.artifactId} already owns ExternalEvent wait ${conflicting.waitId} with a different contract`,
			);
		}
		const waitId = hashCanonicalJson({ runId, causedBy, contract }).slice(0, 32);
		const existing = this.getWait(runId, waitId);
		if (existing !== undefined) return existing;
		const at = new Date(now()).toISOString();
		const wait: WorkflowExternalEventWait = {
			schema: WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA,
			version: 1,
			revision: 1,
			waitId,
			runId,
			causedBy,
			eventType: contract.eventType,
			correlationKey: contract.correlationKey,
			payloadSchema: contract.payloadSchema,
			state: "WAITING",
			createdAt: at,
			updatedAt: at,
		};
		parseWorkflowExternalEventWait(wait);
		ensurePrivateDirectory(this.waitRunDir(runId));
		writePrivateJson(this.waitPathFor(runId, waitId), wait);
		return this.reconcileWait(wait, at);
	}

	getEvent(runId: string, eventId: string): WorkflowExternalEvent | undefined {
		const path = this.eventPathFor(runId, eventId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow ExternalEvent ${eventId}`);
		try {
			return parseWorkflowExternalEvent(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowExternalEventStoreError(
				`workflow ExternalEvent ${eventId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	getWait(runId: string, waitId: string): WorkflowExternalEventWait | undefined {
		const path = this.waitPathFor(runId, waitId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow ExternalEvent wait ${waitId}`);
		try {
			return parseWorkflowExternalEventWait(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowExternalEventStoreError(
				`workflow ExternalEvent wait ${waitId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	listEvents(runId: string): readonly WorkflowExternalEvent[] {
		const directory = this.eventRunDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory()) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent path is not a directory");
		}
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const event = this.getEvent(runId, name.slice(0, -5));
				if (event === undefined)
					throw new WorkflowExternalEventStoreError(`workflow ExternalEvent ${name} disappeared`);
				return event;
			});
	}

	listWaits(runId: string): readonly WorkflowExternalEventWait[] {
		const directory = this.waitRunDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory()) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent wait path is not a directory");
		}
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const wait = this.getWait(runId, name.slice(0, -5));
				if (wait === undefined) {
					throw new WorkflowExternalEventStoreError(`workflow ExternalEvent wait ${name} disappeared`);
				}
				return wait;
			});
	}

	cancelWaitingExcept(
		runId: string,
		activeNeedArtifactIds: ReadonlySet<string>,
		now: () => number = Date.now,
	): readonly WorkflowExternalEventWait[] {
		const cancelled: WorkflowExternalEventWait[] = [];
		const at = new Date(now()).toISOString();
		for (const wait of this.listWaits(runId)) {
			if (wait.state !== "WAITING" || activeNeedArtifactIds.has(wait.causedBy.artifactId)) continue;
			cancelled.push(
				this.updateWait(runId, wait.waitId, wait.revision, (current) => ({
					...current,
					revision: current.revision + 1,
					state: "CANCELLED",
					updatedAt: at,
				})),
			);
		}
		return cancelled;
	}

	reconcile(runId: string, now: () => number = Date.now): readonly WorkflowExternalEventWait[] {
		const at = new Date(now()).toISOString();
		return this.listWaits(runId)
			.filter((wait) => wait.state === "WAITING")
			.map((wait) => this.reconcileWait(wait, at))
			.filter((wait) => wait.state === "MATCHED");
	}

	private reconcileWait(wait: WorkflowExternalEventWait, at: string): WorkflowExternalEventWait {
		if (wait.state !== "WAITING") return wait;
		const event = this.listEvents(wait.runId)
			.filter((candidate) => waitMatchesEvent(wait, candidate))
			.sort(
				(left, right) =>
					left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId),
			)[0];
		if (event === undefined) return wait;
		return this.updateWait(wait.runId, wait.waitId, wait.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "MATCHED",
			matchedEventId: event.eventId,
			updatedAt: at,
		}));
	}

	private updateWait(
		runId: string,
		waitId: string,
		expectedRevision: number,
		mutate: (current: WorkflowExternalEventWait) => WorkflowExternalEventWait,
	): WorkflowExternalEventWait {
		const current = this.getWait(runId, waitId);
		if (current === undefined) {
			throw new WorkflowExternalEventStoreError(`workflow ExternalEvent wait ${waitId} does not exist`);
		}
		if (current.revision !== expectedRevision) {
			throw new WorkflowExternalEventStoreError(
				`workflow ExternalEvent wait ${waitId} revision conflict: expected ${expectedRevision}, current ${current.revision}`,
			);
		}
		const next = mutate(current);
		if (
			next.runId !== current.runId ||
			next.waitId !== current.waitId ||
			canonicalJson(next.causedBy) !== canonicalJson(current.causedBy) ||
			next.eventType !== current.eventType ||
			next.correlationKey !== current.correlationKey ||
			!sameSchema(next.payloadSchema, current.payloadSchema) ||
			next.createdAt !== current.createdAt
		) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent wait identity cannot change");
		}
		if (next.revision !== current.revision + 1) {
			throw new WorkflowExternalEventStoreError("workflow ExternalEvent wait revision must increment by one");
		}
		if (current.state !== "WAITING") {
			throw new WorkflowExternalEventStoreError("terminal workflow ExternalEvent wait cannot change");
		}
		parseWorkflowExternalEventWait(next);
		writePrivateJson(this.waitPathFor(runId, waitId), next);
		return next;
	}
}
