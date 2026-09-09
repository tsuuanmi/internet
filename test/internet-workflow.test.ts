import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";

const roots: string[] = [];

function tool() {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-tool-"));
	roots.push(root);
	const jobs = new WorkflowJobStore(root);
	const engine = new WorkflowEngine(jobs);
	const driver = {
		enqueue() {},
		async cancel(jobId: string) {
			return engine.cancel(jobId);
		},
	};
	return defineInternetWorkflowTool(engine, driver);
}

const exec = { agent: { id: "agent-11" } } as never;

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("internet_workflow", () => {
	it("starts and reports a durable workflow job", async () => {
		const workflow = tool();
		const started = await workflow.execute(
			{
				operation: "start",
				objective: "Fix the race",
				repository: "https://github.com/example/repo",
				baseRevision: "0123456789abcdef0123456789abcdef01234567",
			},
			exec,
		);
		expect(started).toMatchObject({
			ok: true,
			operation: "start",
			state: "CREATED",
			repository: "https://github.com/example/repo",
		});
		const jobId = (started as { jobId: string }).jobId;
		await expect(workflow.execute({ operation: "status", jobId }, exec)).resolves.toMatchObject({
			ok: true,
			operation: "status",
			jobId,
			state: "CREATED",
		});
	});

	it("cancels by job id without reconstructing model context", async () => {
		const workflow = tool();
		const started = await workflow.execute(
			{
				operation: "start",
				objective: "Fix it",
				repository: "https://github.com/example/repo",
				baseRevision: "0123456789abcdef0123456789abcdef01234567",
			},
			exec,
		);
		const jobId = (started as { jobId: string }).jobId;
		await expect(workflow.execute({ operation: "cancel", jobId }, exec)).resolves.toMatchObject({
			ok: true,
			operation: "cancel",
			jobId,
			state: "CANCELLED",
		});
	});

	it("fails closed when required operation arguments are absent", async () => {
		const workflow = tool();
		await expect(workflow.execute({ operation: "status" }, exec)).resolves.toEqual({
			ok: false,
			operation: "status",
			message: "status requires jobId",
		});
	});
});
