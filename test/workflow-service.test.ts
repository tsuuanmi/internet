import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import {
	type WorkflowAuthorizationContext,
	WorkflowService,
	WorkflowServiceError,
	workflowSessionAuthorizationContext,
} from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

function runtime() {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-service-"));
	roots.push(root);
	const { engine, jobs } = createWorkflowTestRuntime(root);
	const driver = {
		enqueue() {},
		async cancel(jobId: string) {
			return engine.cancel(jobId);
		},
		isActive() {
			return false;
		},
	};
	const service = new WorkflowService(engine, driver, jobs, new WorkflowRetentionManager(root, jobs));
	return { service, jobs };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowService", () => {
	it("binds legacy v3 ownership from an explicit authorization context", () => {
		const { service } = runtime();
		const owner = workflowSessionAuthorizationContext("session-a");
		const job = service.start(owner, {
			objective: "Fix the race",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});

		expect(job.ownerSessionId).toBe("session-a");
		expect(service.list(owner).map((candidate) => candidate.jobId)).toEqual([job.jobId]);
		expect(service.status(owner, job.jobId).jobId).toBe(job.jobId);
	});

	it("denies cross-session status, cancel, continue, and delete before mutation", async () => {
		const { service, jobs } = runtime();
		const owner = workflowSessionAuthorizationContext("session-a");
		const other = workflowSessionAuthorizationContext("session-b");
		const job = service.start(owner, {
			objective: "Keep workflow ownership isolated",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		const expected = `workflow job ${job.jobId} does not belong to this session`;

		expect(() => service.status(other, job.jobId)).toThrowError(new WorkflowServiceError(expected));
		await expect(service.cancel(other, job.jobId)).rejects.toThrow(expected);
		expect(() => service.continue(other, job.jobId)).toThrow(expected);
		await expect(service.delete(other, job.jobId)).rejects.toThrow(expected);

		const unchanged = jobs.get(job.jobId);
		expect(unchanged?.graph.lifecycle).toBe("RUNNING");
		expect(unchanged?.ownerSessionId).toBe("session-a");
	});

	it("keeps the service API principal-shaped without granting legacy access implicitly", () => {
		const { service } = runtime();
		const futurePrincipal: WorkflowAuthorizationContext = {
			principal: { kind: "user", id: "user-1" },
		};

		expect(() => service.list(futurePrincipal)).toThrow(
			"legacy workflow operation requires an owner session binding",
		);
	});
});
