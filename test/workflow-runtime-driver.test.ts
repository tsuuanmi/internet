import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowRunCoordinator } from "#internet/workflow/runtime/coordinator";
import { WorkflowRunDriver } from "#internet/workflow/runtime/driver";

function run(runId: string, lifecycle: WorkflowRun["lifecycle"]): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "a".repeat(32),
		owner: { kind: "service", id: "workflow-service" },
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

describe("workflow vNext run driver", () => {
	it("resumes only durable runs that can make autonomous progress", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-driver-"));
		const runs = new WorkflowRunStore(root);
		const createdId = "1".repeat(32);
		const activeId = "2".repeat(32);
		const waitingId = "3".repeat(32);
		const completedId = "4".repeat(32);
		runs.create(run(createdId, "CREATED"));
		runs.create(run(activeId, "ACTIVE"));
		runs.create(run(waitingId, "WAITING_EXTERNAL"));
		runs.create(run(completedId, "COMPLETED"));

		const coordinator = {
			reconcile: (runId: string, signal?: AbortSignal) =>
				new Promise<WorkflowRun>((resolve) => {
					if (signal?.aborted) {
						resolve(runs.get(runId) as WorkflowRun);
						return;
					}
					signal?.addEventListener("abort", () => resolve(runs.get(runId) as WorkflowRun), { once: true });
				}),
		} as unknown as WorkflowRunCoordinator;
		const driver = new WorkflowRunDriver(coordinator, runs);

		driver.resumeActive();

		expect(driver.isActive(createdId)).toBe(true);
		expect(driver.isActive(activeId)).toBe(true);
		expect(driver.isActive(waitingId)).toBe(false);
		expect(driver.isActive(completedId)).toBe(false);

		await driver.dispose();

		expect(driver.isActive(createdId)).toBe(false);
		expect(driver.isActive(activeId)).toBe(false);
	});
});
