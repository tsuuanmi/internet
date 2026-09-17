import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowRunStore, WorkflowRunStoreError } from "#internet/workflow/run-store";
import { createWorkflowTestRuntime } from "./workflow-test-fixture";

const runId = "11111111111111111111111111111111";
const admissionId = "22222222222222222222222222222222";
const at = "2026-09-17T00:00:00.000Z";

function run(): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId,
		owner: { kind: "session", id: "1-1" },
		lifecycle: "CREATED",
		definitions: {
			profile: { id: "software_change", version: "1" },
			policy: { id: "workflow", version: "1" },
			capabilities: [{ id: "repository_research", version: "1" }],
			schemas: [{ id: "workflow-artifact", version: "1" }],
			projection: { id: "default-input-projection", version: "1" },
		},
		createdAt: at,
		updatedAt: at,
	};
}

describe("workflow run store", () => {
	it("persists vNext runs with revision CAS and pinned definitions", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-run-"));
		const store = new WorkflowRunStore(root);
		store.create(run());
		const updated = store.update(runId, 1, (current) => ({
			...current,
			revision: 2,
			lifecycle: "ACTIVE",
			updatedAt: "2026-09-17T00:00:01.000Z",
		}));
		expect(updated.lifecycle).toBe("ACTIVE");
		expect(store.list()).toEqual([updated]);
		expect(() => store.update(runId, 1, (current) => current)).toThrow("revision conflict");
		expect(() =>
			store.update(runId, 2, (current) => ({
				...current,
				revision: 3,
				definitions: { ...current.definitions, policy: { id: "workflow", version: "2" } },
				updatedAt: "2026-09-17T00:00:02.000Z",
			})),
		).toThrow("definition bindings cannot change");
	});

	it("coexists with WorkflowJob v3 in the same data directory", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-coexist-"));
		const legacy = createWorkflowTestRuntime(root);
		const job = legacy.engine.start({
			objective: "legacy workflow",
			repository: "https://github.com/example/repo",
			baseRevision: "a".repeat(40),
			ownerSessionId: "1-1",
		});
		const runs = new WorkflowRunStore(root);
		runs.create(run());
		expect(legacy.jobs.get(job.jobId)?.version).toBe(3);
		expect(runs.get(runId)?.version).toBe(1);
		expect(runs.pathFor(runId)).toContain("/workflows/runs/");
		expect(legacy.jobs.pathFor(job.jobId)).toContain("/workflows/jobs/");
	});

	it("rejects duplicate run identity", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-run-duplicate-"));
		const store = new WorkflowRunStore(root);
		store.create(run());
		expect(() => store.create(run())).toThrow(WorkflowRunStoreError);
	});
});
