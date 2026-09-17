import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	WORKFLOW_EXECUTION_SCHEMA,
	type WorkflowExecution,
	WorkflowExecutionResultStore,
} from "#internet/workflow/runtime/index";

const execution: WorkflowExecution = {
	schema: WORKFLOW_EXECUTION_SCHEMA,
	version: 1,
	revision: 1,
	executionId: "1".repeat(32),
	runId: "2".repeat(32),
	workItemId: "3".repeat(32),
	inputBundleId: "4".repeat(64),
	capability: { id: "research", version: "1" },
	attempt: 1,
	ownerInstanceId: "runtime-1",
	state: "RUNNING",
	startedAt: "2026-09-17T10:00:00.000Z",
	heartbeatAt: "2026-09-17T10:00:00.000Z",
	leaseUntil: "2026-09-17T10:05:00.000Z",
};

function result(overrides: Record<string, unknown> = {}) {
	return {
		executionId: execution.executionId,
		workItemId: execution.workItemId,
		inputBundleId: execution.inputBundleId,
		receiptIds: [],
		artifacts: [],
		...overrides,
	};
}

describe("workflow vNext execution result store", () => {
	it("persists only results bound to the exact execution", () => {
		const store = new WorkflowExecutionResultStore(mkdtempSync(join(tmpdir(), "internet-workflow-result-")));
		expect(store.create(execution, result())).toEqual(result());
		expect(store.create(execution, result())).toEqual(result());
		expect(() => store.create(execution, result({ executionId: "5".repeat(32) }))).toThrow(
			"execution id does not match execution",
		);
	});

	it("rejects conflicting data for an already persisted execution", () => {
		const store = new WorkflowExecutionResultStore(mkdtempSync(join(tmpdir(), "internet-workflow-result-conflict-")));
		store.create(execution, result());
		expect(() => store.create(execution, result({ receiptIds: ["different"] }))).toThrow(
			"conflicts with persisted result",
		);
	});
});
