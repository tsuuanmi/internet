import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowRetentionError, WorkflowRetentionManager } from "#internet/workflow/retention";

const roots: string[] = [];

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-retention-"));
	roots.push(root);
	const jobs = new WorkflowJobStore(root);
	const engine = new WorkflowEngine(jobs);
	const handoffs = new WorkflowHandoffStore(root);
	const now = () => new Date("2026-09-09T00:00:00.000Z");
	const retention = new WorkflowRetentionManager(root, jobs, undefined, now);
	return { root, jobs, engine, handoffs, retention };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowRetentionManager", () => {
	it("previews only aged terminal jobs and deletes one exact unchanged job with an audit", () => {
		const { root, jobs, engine, handoffs, retention } = fixture();
		const started = engine.start({
			objective: "old cancelled work",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));
		const handoff = handoffs.create({
			jobId: old.jobId,
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload: "exact payload",
		});

		expect(retention.preview()).toEqual([
			expect.objectContaining({ jobId: old.jobId, state: "CANCELLED", updatedAt: old.updatedAt, retentionDays: 14 }),
		]);
		const audit = retention.cleanup({
			jobId: old.jobId,
			expectedUpdatedAt: old.updatedAt,
			operatorSessionId: "operator",
		});
		expect(audit).toMatchObject({ status: "COMPLETED", jobId: old.jobId, deletedHandoffFiles: 1 });
		expect(jobs.get(old.jobId)).toBeUndefined();
		expect(handoffs.get(old.jobId, handoff.handoffId)).toBeUndefined();
		expect(existsSync(join(root, "workflows", "cleanup-audit", `${audit.auditId}.json`))).toBe(true);
		expect(
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toEqual(audit);
	});

	it("never exposes active jobs as cleanup candidates", () => {
		const { engine, retention } = fixture();
		engine.start({
			objective: "active work",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		expect(retention.preview()).toEqual([]);
	});

	it("fails closed if the job changed after preview", () => {
		const { jobs, engine, retention } = fixture();
		const started = engine.start({
			objective: "stale preview",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));
		jobs.update(old.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-02T00:00:00.000Z",
		}));
		expect(() =>
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toThrow(WorkflowRetentionError);
	});
});
