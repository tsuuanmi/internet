import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	WORKFLOW_EXECUTION_SCHEMA,
	type WorkflowExecution,
	WorkflowExecutionStore,
} from "#internet/workflow/runtime/index";

const runId = "1".repeat(32);
const workItemId = "2".repeat(32);
const executionId = "3".repeat(32);
const inputBundleId = "4".repeat(64);
const at = "2026-09-17T10:00:00.000Z";

function execution(): WorkflowExecution {
	return {
		schema: WORKFLOW_EXECUTION_SCHEMA,
		version: 1,
		revision: 1,
		executionId,
		runId,
		workItemId,
		inputBundleId,
		capability: { id: "research", version: "1" },
		attempt: 1,
		ownerInstanceId: "runtime-1",
		state: "RUNNING",
		startedAt: at,
		heartbeatAt: at,
		leaseUntil: "2026-09-17T10:05:00.000Z",
	};
}

describe("workflow vNext execution store", () => {
	it("uses revision fencing and immutable execution authority", () => {
		const store = new WorkflowExecutionStore(mkdtempSync(join(tmpdir(), "internet-workflow-execution-")));
		store.create(execution());
		const succeeded = store.update(runId, executionId, 1, (current) => ({
			...current,
			revision: 2,
			state: "SUCCEEDED",
			finishedAt: "2026-09-17T10:01:00.000Z",
		}));
		expect(succeeded.state).toBe("SUCCEEDED");
		expect(() => store.update(runId, executionId, 1, (current) => current)).toThrow("revision conflict");
		expect(() => store.update(runId, executionId, 2, (current) => ({ ...current, revision: 3 }))).toThrow(
			"terminal workflow execution cannot change",
		);
	});

	it("requires failure details for failed executions", () => {
		const store = new WorkflowExecutionStore(mkdtempSync(join(tmpdir(), "internet-workflow-execution-failure-")));
		expect(() => store.create({ ...execution(), state: "FAILED", finishedAt: "2026-09-17T10:01:00.000Z" })).toThrow(
			"requires failure details",
		);
	});
});
