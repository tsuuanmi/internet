import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineInternetWorkflowTool, type InternetWorkflowToolDependencies } from "#internet/tools/internet-workflow";
import { WorkflowAdmissionActivationRegistry } from "#internet/workflow/admission/activation-registry";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { createSoftwareWorkflowActivationHandler } from "#internet/workflow/profiles/software-activation";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService } from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

function tool(dependencies: InternetWorkflowToolDependencies = {}) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-tool-"));
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
	const admissions = new WorkflowAdmissionService(
		new WorkflowAdmissionStore(root),
		new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id),
	);
	const retention = new WorkflowRetentionManager(root, jobs);
	const service = new WorkflowService({
		admissionService: admissions,
		activationRegistry: new WorkflowAdmissionActivationRegistry([
			createSoftwareWorkflowActivationHandler(engine, driver, jobs),
		]),
		legacy: { engine, driver, jobs, retention },
	});
	return defineInternetWorkflowTool(service, dependencies);
}

const exec = { agent: { id: "agent-11" }, signal: new AbortController().signal } as never;
const otherExec = { agent: { id: "agent-22" }, signal: new AbortController().signal } as never;

async function admitAndActivate(workflow: ReturnType<typeof tool>, objective: string) {
	const admitted = (await workflow.execute(
		{
			operation: "admit",
			objective,
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		},
		exec,
	)) as {
		admissionId: string;
		admissionRevision: number;
		admissionState: string;
		draftHash: string;
	};
	expect(admitted).toMatchObject({ ok: true, operation: "admit", admissionState: "AWAITING_CONFIRMATION" });

	const confirmed = (await workflow.execute(
		{
			operation: "confirm",
			admissionId: admitted.admissionId,
			admissionRevision: admitted.admissionRevision,
			draftHash: admitted.draftHash,
			confirmationProvenance: "local_interpreted",
		},
		exec,
	)) as { admissionId: string; admissionState: string; acceptedSpecHash: string };
	expect(confirmed).toMatchObject({ ok: true, operation: "confirm", admissionState: "ACCEPTED" });

	return workflow.execute(
		{
			operation: "activate",
			admissionId: confirmed.admissionId,
			acceptedSpecHash: confirmed.acceptedSpecHash,
		},
		exec,
	);
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("internet_workflow", () => {
	it("admits, confirms, activates, and reports a durable workflow", async () => {
		const workflow = tool();
		const activated = await admitAndActivate(workflow, "Fix the race");
		expect(activated).toMatchObject({
			ok: true,
			operation: "activate",
			phase: "RESEARCH",
			lifecycle: "RUNNING",
			repository: "https://github.com/example/repo",
		});
		const jobId = (activated as { jobId: string }).jobId;
		await expect(workflow.execute({ operation: "status", jobId }, exec)).resolves.toMatchObject({
			ok: true,
			operation: "status",
			jobId,
			phase: "RESEARCH",
			lifecycle: "RUNNING",
		});
	});

	it("does not let another principal confirm an admission", async () => {
		const workflow = tool();
		const admitted = (await workflow.execute(
			{
				operation: "admit",
				objective: "Keep admission ownership explicit",
				repository: "https://github.com/example/repo",
				baseRevision: REVISION,
			},
			exec,
		)) as { admissionId: string; admissionRevision: number; draftHash: string };

		await expect(
			workflow.execute(
				{
					operation: "confirm",
					admissionId: admitted.admissionId,
					admissionRevision: admitted.admissionRevision,
					draftHash: admitted.draftHash,
					confirmationProvenance: "local_interpreted",
				},
				otherExec,
			),
		).resolves.toEqual({
			ok: false,
			operation: "confirm",
			message: `admission ${admitted.admissionId} does not belong to this principal`,
		});
	});

	it("cancels by job id without reconstructing model context", async () => {
		const workflow = tool();
		const activated = await admitAndActivate(workflow, "Fix it");
		const jobId = (activated as { jobId: string }).jobId;
		await expect(workflow.execute({ operation: "cancel", jobId }, exec)).resolves.toMatchObject({
			ok: true,
			operation: "cancel",
			jobId,
			lifecycle: "CANCELLED",
		});
	});

	it("denies cross-session status, cancel, and continue through the same service boundary", async () => {
		const workflow = tool();
		const activated = await admitAndActivate(workflow, "Keep this private to one session");
		const jobId = (activated as { jobId: string }).jobId;
		for (const operation of ["status", "cancel", "continue"] as const) {
			await expect(workflow.execute({ operation, jobId }, otherExec)).resolves.toEqual({
				ok: false,
				operation,
				message: `workflow job ${jobId} does not belong to this session`,
			});
		}
	});

	it("fails closed when required operation arguments are absent", async () => {
		const workflow = tool();
		await expect(workflow.execute({ operation: "status" }, exec)).resolves.toEqual({
			ok: false,
			operation: "status",
			message: "status requires jobId",
		});
		await expect(workflow.execute({ operation: "confirm" }, exec)).resolves.toEqual({
			ok: false,
			operation: "confirm",
			message: "confirm requires admissionId, admissionRevision, draftHash, and confirmationProvenance",
		});
	});

	it("preflights every semantic account before starting an acceptance workflow", async () => {
		const browser = {
			async status(accountId: string) {
				return {
					accountId,
					provider: accountId === "gemini-thinker" ? ("gemini-web" as const) : ("chatgpt-web" as const),
					state: accountId === "chatgpt-writer" ? ("reauth-required" as const) : ("ready" as const),
					accountPath: `/accounts/${accountId}.json`,
				};
			},
		};
		const workflow = tool({ browser: browser as never });
		const testExec = {
			agent: { id: "agent-11", session: { header: { cwd: "/repo" } } },
			signal: new AbortController().signal,
		} as never;
		await expect(workflow.execute({ operation: "test" }, testExec)).resolves.toMatchObject({
			ok: false,
			operation: "test",
			result: "FAIL",
			accountPreflight: expect.stringContaining("chatgpt-writer=reauth-required"),
			message: expect.stringContaining("workflow test not started"),
		});
	});
});
