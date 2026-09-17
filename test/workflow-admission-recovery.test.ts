import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService } from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-admission-recovery-"));
	roots.push(path);
	return path;
}

function draft(objective: string) {
	return createSoftwareAdmissionDraft({
		rawSource: objective,
		sourceProvenance: "user_explicit",
		repository: "https://github.com/example/repo",
		baseRevision: REVISION,
		targetProvenance: "system_observed",
		authorityProvenance: "user_explicit",
	});
}

function driverFor(runtime: ReturnType<typeof createWorkflowTestRuntime>) {
	return {
		enqueue() {},
		async cancel(jobId: string) {
			return runtime.engine.cancel(jobId);
		},
		isActive() {
			return false;
		},
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workflow admission activation recovery", () => {
	it("reconciles an already-created deterministic workflow job after a crash before the activation receipt", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		let id = 0;
		const ids = ["00000000000000000000000000000011", "00000000000000000000000000000012"];
		const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles, {
			now: () => new Date("2026-09-17T00:00:00.000Z"),
			createId: () => ids[id++]!,
		});
		const authorization = workflowSessionAuthorizationContext("session-a");
		const created = admissions.create(authorization.principal, draft("Recover exact activation"));
		const accepted = admissions.preflight(authorization.principal, created.admissionId, created.revision);
		expect(accepted.state).toBe("ACCEPTED");

		const persistedBeforeReceipt = runtime.engine.start({
			jobId: accepted.admissionId,
			ownerSessionId: "session-a",
			objective: "Recover exact activation",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		expect(admissions.get(authorization.principal, accepted.admissionId)?.state).toBe("ACCEPTED");

		const workflow = new WorkflowService(
			runtime.engine,
			driverFor(runtime),
			runtime.jobs,
			new WorkflowRetentionManager(path, runtime.jobs),
			admissions,
		);
		const recovered = workflow.activateAdmission(authorization, accepted.admissionId, accepted.acceptedSpecHash!);

		expect(recovered.jobId).toBe(persistedBeforeReceipt.jobId);
		expect(recovered.jobId).toBe(accepted.admissionId);
		expect(runtime.jobs.list()).toHaveLength(1);
		expect(admissions.get(authorization.principal, accepted.admissionId)).toMatchObject({
			state: "ACTIVATED",
			activation: {
				targetKind: "workflow_job",
				targetId: accepted.admissionId,
			},
		});
	});

	it("rejects a deterministic workflow job id collision with incompatible persisted state", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		let id = 0;
		const ids = ["00000000000000000000000000000021", "00000000000000000000000000000022"];
		const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles, {
			createId: () => ids[id++]!,
		});
		const authorization = workflowSessionAuthorizationContext("session-a");
		const created = admissions.create(authorization.principal, draft("Expected objective"));
		const accepted = admissions.preflight(authorization.principal, created.admissionId, created.revision);
		runtime.engine.start({
			jobId: accepted.admissionId,
			ownerSessionId: "session-a",
			objective: "Different objective",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		const workflow = new WorkflowService(
			runtime.engine,
			driverFor(runtime),
			runtime.jobs,
			new WorkflowRetentionManager(path, runtime.jobs),
			admissions,
		);

		expect(() => workflow.activateAdmission(authorization, accepted.admissionId, accepted.acceptedSpecHash!)).toThrow(
			"conflicts with accepted admission identity",
		);
		expect(admissions.get(authorization.principal, accepted.admissionId)).toMatchObject({
			state: "ACTIVATING",
			activationIntent: {
				targetKind: "workflow_job",
				targetId: accepted.admissionId,
				acceptedSpecHash: accepted.acceptedSpecHash,
			},
		});
	});

	it("does not reschedule a terminal target when an activated admission is retried", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles);
		const authorization = workflowSessionAuthorizationContext("session-a");
		let enqueueCount = 0;
		const driver = {
			enqueue() {
				enqueueCount += 1;
			},
			async cancel(jobId: string) {
				return runtime.engine.cancel(jobId);
			},
			isActive() {
				return false;
			},
		};
		const workflow = new WorkflowService(
			runtime.engine,
			driver,
			runtime.jobs,
			new WorkflowRetentionManager(path, runtime.jobs),
			admissions,
		);
		const job = workflow.start(authorization, draft("Retry exact terminal activation"));
		const admission = workflow.admissions(authorization)[0]!;
		expect(enqueueCount).toBe(1);

		runtime.engine.cancel(job.jobId);
		enqueueCount = 0;
		const retried = workflow.activateAdmission(authorization, admission.admissionId, admission.acceptedSpecHash!);

		expect(retried.graph.lifecycle).toBe("CANCELLED");
		expect(enqueueCount).toBe(0);
	});
});
