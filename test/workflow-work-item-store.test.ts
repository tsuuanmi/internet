import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_WORK_ITEM_SCHEMA, type WorkflowWorkItem } from "#internet/workflow/kernel/types";
import { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

const runId = "11111111111111111111111111111111";
const workItemId = "22222222222222222222222222222222";
const bundleId = "a".repeat(64);
const at = "2026-09-17T00:00:00.000Z";

function item(): WorkflowWorkItem {
	return {
		schema: WORKFLOW_WORK_ITEM_SCHEMA,
		version: 1,
		revision: 1,
		workItemId,
		runId,
		needId: "need-1",
		requestOwner: { kind: "workflow_run", id: runId },
		capability: { id: "repository_research", version: "1" },
		sideEffect: "READ_ONLY",
		state: "PENDING",
		executionIds: [],
		resultArtifactIds: [],
		receiptIds: [],
		createdAt: at,
		updatedAt: at,
	};
}

describe("workflow work item store", () => {
	it("binds exact input once and keeps execution/result references append-only", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-work-item-"));
		const store = new WorkflowWorkItemStore(root);
		store.create(item());
		const ready = store.update(runId, workItemId, 1, (current) => ({
			...current,
			revision: 2,
			state: "READY",
			inputBundleId: bundleId,
			updatedAt: "2026-09-17T00:00:01.000Z",
		}));
		const running = store.update(runId, workItemId, 2, (current) => ({
			...current,
			revision: 3,
			state: "RUNNING",
			executionIds: [...current.executionIds, "execution-1"],
			updatedAt: "2026-09-17T00:00:02.000Z",
		}));
		expect(ready.inputBundleId).toBe(bundleId);
		expect(running.executionIds).toEqual(["execution-1"]);
		expect(() =>
			store.update(runId, workItemId, 3, (current) => ({
				...current,
				revision: 4,
				inputBundleId: "b".repeat(64),
				updatedAt: "2026-09-17T00:00:03.000Z",
			})),
		).toThrow("input bundle cannot change once bound");
	});

	it("rejects authority/capability mutation and reference deletion", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-work-item-authority-"));
		const store = new WorkflowWorkItemStore(root);
		store.create({ ...item(), inputBundleId: bundleId, state: "RUNNING", executionIds: ["execution-1"] });
		expect(() =>
			store.update(runId, workItemId, 1, (current) => ({
				...current,
				revision: 2,
				capability: { id: "implementation", version: "1" },
				updatedAt: "2026-09-17T00:00:01.000Z",
			})),
		).toThrow("capability cannot change");
		expect(() =>
			store.update(runId, workItemId, 1, (current) => ({
				...current,
				revision: 2,
				executionIds: [],
				updatedAt: "2026-09-17T00:00:01.000Z",
			})),
		).toThrow("execution ids must be append-only");
	});

	it("requires an exact InputBundle before executable states", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-work-item-input-"));
		const store = new WorkflowWorkItemStore(root);
		expect(() => store.create({ ...item(), state: "READY" })).toThrow("state requires an input bundle");
	});
});
