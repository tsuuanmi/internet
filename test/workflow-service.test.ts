import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import type { WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService, WorkflowServiceError } from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

function softwareDraft(objective: string) {
	return createSoftwareAdmissionDraft({
		rawSource: objective,
		sourceProvenance: "user_explicit",
		repository: "https://github.com/example/repo",
		baseRevision: REVISION,
		targetProvenance: "system_observed",
		authorityProvenance: "user_explicit",
	});
}

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
	const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
	const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(root), profiles);
	const service = new WorkflowService(engine, driver, jobs, new WorkflowRetentionManager(root, jobs), admissions);
	return { service, jobs };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowService", () => {
	it("starts software execution through an explicit AUTO_SUBMIT admission", () => {
		const { service } = runtime();
		const owner = workflowSessionAuthorizationContext("session-a");
		const job = service.start(owner, softwareDraft("Fix the race"));

		expect(job.ownerSessionId).toBe("session-a");
		expect(service.list(owner).map((candidate) => candidate.jobId)).toEqual([job.jobId]);
		expect(service.status(owner, job.jobId).jobId).toBe(job.jobId);
		expect(service.admissions(owner)).toHaveLength(1);
		expect(service.admissions(owner)[0]).toMatchObject({
			state: "ACTIVATED",
			activation: { targetKind: "workflow_job", targetId: job.jobId },
		});
	});

	it("denies cross-session status, cancel, continue, and delete before mutation", async () => {
		const { service, jobs } = runtime();
		const owner = workflowSessionAuthorizationContext("session-a");
		const other = workflowSessionAuthorizationContext("session-b");
		const job = service.start(owner, softwareDraft("Keep workflow ownership isolated"));
		const expected = `workflow job ${job.jobId} does not belong to this session`;

		expect(() => service.status(other, job.jobId)).toThrowError(new WorkflowServiceError(expected));
		await expect(service.cancel(other, job.jobId)).rejects.toThrow(expected);
		expect(() => service.continue(other, job.jobId)).toThrow(expected);
		await expect(service.delete(other, job.jobId)).rejects.toThrow(expected);

		const unchanged = jobs.get(job.jobId);
		expect(unchanged?.graph.lifecycle).toBe("RUNNING");
		expect(unchanged?.ownerSessionId).toBe("session-a");
	});

	it("allows principal-only admission but requires a session binding before software activation", () => {
		const { service } = runtime();
		const principalOnly: WorkflowAuthorizationContext = {
			principal: { kind: "user", id: "user-1" },
		};
		const admitted = service.admit(principalOnly, softwareDraft("Prepare a durable request"));

		expect(admitted.state).toBe("ACCEPTED");
		expect(service.admission(principalOnly, admitted.admissionId).admissionId).toBe(admitted.admissionId);
		expect(() => service.activateAdmission(principalOnly, admitted.admissionId, admitted.acceptedSpecHash!)).toThrow(
			"workflow operation requires an owner session binding",
		);
	});
});
