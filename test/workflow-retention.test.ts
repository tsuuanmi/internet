import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowRetentionError, WorkflowRetentionManager } from "#internet/workflow/retention";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const baseRevision = "0123456789abcdef0123456789abcdef01234567";

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-retention-"));
	roots.push(root);
	const runtime = createWorkflowTestRuntime(root);
	const handoffs = new WorkflowHandoffStore(root);
	const retention = new WorkflowRetentionManager(
		root,
		runtime.jobs,
		undefined,
		() => new Date("2026-09-09T00:00:00.000Z"),
	);
	return { root, ...runtime, handoffs, retention };
}

function start(engine: ReturnType<typeof createWorkflowTestRuntime>["engine"], objective: string) {
	return engine.start({
		objective,
		repository: "https://github.com/example/repo",
		baseRevision,
		ownerSessionId: "owner",
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowRetentionManager", () => {
	it("deletes one exact aged graph job and all scoped durable artifacts with an audit", () => {
		const { root, jobs, engine, handoffs, results, retention } = fixture();
		const started = start(engine, "old cancelled work");
		const rootNode = Object.values(started.graph.nodes).find((node) => node.input !== undefined);
		if (rootNode?.input === undefined) throw new Error("workflow root node input is required");
		const result = results.create({
			jobId: started.jobId,
			nodeId: rootNode.nodeId,
			inputHash: rootNode.input.inputHash,
			payload: "exact node payload",
		});
		const handoff = handoffs.create({
			jobId: started.jobId,
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload: "exact handoff payload",
		});
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, cancelled.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));

		expect(retention.preview()).toEqual([
			expect.objectContaining({
				jobId: old.jobId,
				lifecycle: "CANCELLED",
				updatedAt: old.updatedAt,
				retentionDays: 14,
			}),
		]);
		const audit = retention.cleanup({
			jobId: old.jobId,
			expectedUpdatedAt: old.updatedAt,
			operatorSessionId: "operator",
		});
		expect(audit).toMatchObject({ status: "COMPLETED", jobId: old.jobId, deletedFiles: 4 });
		expect(jobs.get(old.jobId)).toBeUndefined();
		expect(handoffs.get(old.jobId, handoff.handoffId)).toBeUndefined();
		expect(results.get(old.jobId, result.resultId)).toBeUndefined();
		expect(existsSync(join(root, "workflows", "events", old.jobId))).toBe(false);
		expect(existsSync(join(root, "workflows", "cleanup-audit", `${audit.auditId}.json`))).toBe(true);
		expect(
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toEqual(audit);
	});

	it("never exposes active jobs as cleanup candidates", () => {
		const { engine, retention } = fixture();
		start(engine, "active work");
		expect(retention.preview()).toEqual([]);
	});

	it("fails closed when the exact job revision changed after preview", () => {
		const { jobs, engine, retention } = fixture();
		const started = start(engine, "stale preview");
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, cancelled.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));
		jobs.update(old.jobId, old.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-02T00:00:00.000Z",
		}));

		expect(() =>
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toThrow(WorkflowRetentionError);
	});
});
