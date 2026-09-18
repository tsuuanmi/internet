import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowDurableAwaitableRuntime } from "#internet/workflow/awaitables/runtime";
import { WorkflowExternalEventStore, WorkflowExternalEventStoreError } from "#internet/workflow/external-event-store";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowTimerStore } from "#internet/workflow/timer-store";
import { WorkflowWakeupScheduler } from "#internet/workflow/wakeup-scheduler";

const runId = "1".repeat(32);
const need = { runId, artifactId: "2".repeat(64) };

function run(lifecycle: WorkflowRun["lifecycle"] = "WAITING_EXTERNAL"): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "3".repeat(32),
		owner: { kind: "session", id: "owner" },
		lifecycle,
		definitions: {
			profile: { id: "test", version: "1" },
			policy: { id: "test", version: "1" },
			capabilities: [],
			schemas: [],
			projection: { id: "test", version: "1" },
		},
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
}

describe("workflow durable Timer and ExternalEvent", () => {
	it("persists Timer deadlines and fires overdue Timers after store reconstruction", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-timer-"));
		const first = new WorkflowTimerStore(root);
		const timer = first.ensure(
			runId,
			need,
			{ timerType: "research.refresh", deadline: "2026-09-18T01:00:00.000Z" },
			() => Date.parse("2026-09-18T00:00:00.000Z"),
		);
		expect(timer.state).toBe("PENDING");

		const reconstructed = new WorkflowTimerStore(root);
		const [fired] = reconstructed.reconcile(runId, () => Date.parse("2026-09-18T02:00:00.000Z"));
		expect(fired?.state).toBe("FIRED");
		expect(fired?.firedAt).toBe("2026-09-18T02:00:00.000Z");
		expect(reconstructed.get(runId, timer.timerId)?.deadline).toBe("2026-09-18T01:00:00.000Z");
	});

	it("cancels stale Timer and ExternalEvent waits before they can wake a run", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-awaitable-invalidation-"));
		const timers = new WorkflowTimerStore(root);
		const events = new WorkflowExternalEventStore(root);
		const runtime = new WorkflowDurableAwaitableRuntime(timers, events);
		const timer = runtime.ensureTimer(
			runId,
			need,
			{ timerType: "research.refresh", deadline: "2026-09-18T01:00:00.000Z" },
			() => Date.parse("2026-09-18T00:00:00.000Z"),
		);
		const wait = runtime.ensureExternalEventWait(runId, need, {
			eventType: "research.updated",
			correlationKey: "topic:stale",
			payloadSchema: { id: "research.updated", version: "1" },
		});

		runtime.cancelInactive(runId, new Set(), () => Date.parse("2026-09-18T00:30:00.000Z"));
		expect(timers.get(runId, timer.timerId)?.state).toBe("CANCELLED");
		expect(events.getWait(runId, wait.waitId)?.state).toBe("CANCELLED");

		runtime.reconcile(runId, () => Date.parse("2026-09-18T02:00:00.000Z"));
		expect(timers.get(runId, timer.timerId)?.state).toBe("CANCELLED");
		events.ingest({
			runId,
			source: "provider",
			sourceEventId: "event-stale",
			eventType: "research.updated",
			correlationKey: "topic:stale",
			payloadSchema: { id: "research.updated", version: "1" },
			payload: { ready: true },
			occurredAt: "2026-09-18T02:00:00.000Z",
		});
		expect(events.getWait(runId, wait.waitId)?.state).toBe("CANCELLED");
		expect(runtime.hasOpen(runId, need.artifactId)).toBe(false);
	});

	it("deduplicates identical ExternalEvent delivery and rejects conflicting replay", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-event-"));
		const store = new WorkflowExternalEventStore(root);
		const input = {
			runId,
			source: "provider",
			sourceEventId: "event-42",
			eventType: "research.updated",
			correlationKey: "topic:a",
			payloadSchema: { id: "research.updated", version: "1" },
			payload: { revision: 1 },
			occurredAt: "2026-09-18T01:00:00.000Z",
		};
		const first = store.ingest(input, () => Date.parse("2026-09-18T01:01:00.000Z"));
		const replay = store.ingest(input, () => Date.parse("2026-09-18T01:02:00.000Z"));
		expect(replay).toEqual(first);
		expect(store.listEvents(runId)).toHaveLength(1);
		expect(() =>
			store.ingest({ ...input, payload: { revision: 2 } }, () => Date.parse("2026-09-18T01:03:00.000Z")),
		).toThrow(WorkflowExternalEventStoreError);
	});

	it("matches an event delivered before its durable wait is created", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-event-before-wait-"));
		const store = new WorkflowExternalEventStore(root);
		const event = store.ingest({
			runId,
			source: "provider",
			sourceEventId: "event-early",
			eventType: "research.updated",
			correlationKey: "topic:b",
			payloadSchema: { id: "research.updated", version: "1" },
			payload: { ready: true },
			occurredAt: "2026-09-18T01:00:00.000Z",
		});
		const wait = store.ensureWait(runId, need, {
			eventType: "research.updated",
			correlationKey: "topic:b",
			payloadSchema: { id: "research.updated", version: "1" },
		});
		expect(wait.state).toBe("MATCHED");
		expect(wait.matchedEventId).toBe(event.eventId);
	});

	it("wakes a persisted matched ExternalEvent wait after process reconstruction", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-event-restart-"));
		const runs = new WorkflowRunStore(root);
		runs.create(run());
		const events = new WorkflowExternalEventStore(root);
		events.ensureWait(runId, need, {
			eventType: "research.updated",
			correlationKey: "topic:restart",
			payloadSchema: { id: "research.updated", version: "1" },
		});
		events.ingest({
			runId,
			source: "provider",
			sourceEventId: "event-before-crash",
			eventType: "research.updated",
			correlationKey: "topic:restart",
			payloadSchema: { id: "research.updated", version: "1" },
			payload: { ready: true },
			occurredAt: "2026-09-18T01:00:00.000Z",
		});
		events.reconcile(runId);
		expect(events.listWaits(runId)[0]?.state).toBe("MATCHED");

		const woken: string[] = [];
		const scheduler = new WorkflowWakeupScheduler(
			new WorkflowTimerStore(root),
			new WorkflowExternalEventStore(root),
			new WorkflowRunStore(root),
			{ enqueue: (id) => woken.push(id) },
		);
		scheduler.start();
		expect(woken).toEqual([runId]);
		scheduler.dispose();
	});

	it("reconciles overdue Timers on scheduler start and wakes only the owning run", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-wakeup-"));
		const runs = new WorkflowRunStore(root);
		runs.create(run());
		const timers = new WorkflowTimerStore(root);
		timers.ensure(runId, need, { timerType: "research.refresh", deadline: "2026-09-18T01:00:00.000Z" }, () =>
			Date.parse("2026-09-18T00:00:00.000Z"),
		);
		const woken: string[] = [];
		const scheduler = new WorkflowWakeupScheduler(
			timers,
			new WorkflowExternalEventStore(root),
			runs,
			{ enqueue: (id) => woken.push(id) },
			{ now: () => Date.parse("2026-09-18T02:00:00.000Z") },
		);
		scheduler.start();
		expect(woken).toEqual([runId]);
		expect(timers.list(runId)[0]?.state).toBe("FIRED");
		scheduler.dispose();
	});
});
