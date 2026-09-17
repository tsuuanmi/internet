import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService, workflowSessionAuthorizationContext } from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-admission-recovery-"));
	roots.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workflow admission activation recovery", () => {
	it("reconciles an already-created deterministic v3 job after a crash before the activation receipt", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		let id = 0;
		const ids = ["00000000000000000000000000000011", "00000000000000000000000000000012"];
		const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles, {
			now: () => new Date("2026-09-17T00:00:00.000Z"),
			createId: () => ids[id++]!,
		});
		const owner = { kind: "session", id: "session-a" };
		const created = admissions.create(owner, {
			source: { kind: "user", rawText: "Recover exact activation", provenance: "user_explicit" },
			profileHint: { value: "software_change", provenance: "policy_default" },
			target: {
				repository: { value: "https://github.com/example/repo", provenance: "system_observed" },
				baseRevision: { value: REVISION, provenance: "system_observed" },
			},
			authority: { repositoryMutation: { value: true, provenance: "user_explicit" } },
		});
		const accepted = admissions.preflight(created.admissionId, created.revision);
		expect(accepted.state).toBe("ACCEPTED");

		const persistedBeforeReceipt = runtime.engine.start({
			jobId: accepted.admissionId,
			ownerSessionId: "session-a",
			objective: "Recover exact activation",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		expect(admissions.get(accepted.admissionId)?.state).toBe("ACCEPTED");

		const driver = {
			enqueue() {},
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
		const recovered = workflow.activateLegacyAdmission(
			workflowSessionAuthorizationContext("session-a"),
			accepted.admissionId,
			accepted.revision,
			accepted.acceptedSpecHash!,
		);

		expect(recovered.jobId).toBe(persistedBeforeReceipt.jobId);
		expect(recovered.jobId).toBe(accepted.admissionId);
		expect(runtime.jobs.list()).toHaveLength(1);
		expect(admissions.get(accepted.admissionId)).toMatchObject({
			state: "ACTIVATED",
			activation: {
				targetKind: "legacy_v3_job",
				targetId: accepted.admissionId,
			},
		});
	});

	it("rejects a deterministic legacy id collision with incompatible persisted state", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const profiles = new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
		let id = 0;
		const ids = ["00000000000000000000000000000021", "00000000000000000000000000000022"];
		const admissions = new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles, {
			createId: () => ids[id++]!,
		});
		const owner = { kind: "session", id: "session-a" };
		const created = admissions.create(owner, {
			source: { kind: "user", rawText: "Expected objective", provenance: "user_explicit" },
			profileHint: { value: "software_change", provenance: "policy_default" },
			target: {
				repository: { value: "https://github.com/example/repo", provenance: "system_observed" },
				baseRevision: { value: REVISION, provenance: "system_observed" },
			},
		});
		const accepted = admissions.preflight(created.admissionId, created.revision);
		runtime.engine.start({
			jobId: accepted.admissionId,
			ownerSessionId: "session-a",
			objective: "Different objective",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		const driver = {
			enqueue() {},
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

		expect(() =>
			workflow.activateLegacyAdmission(
				workflowSessionAuthorizationContext("session-a"),
				accepted.admissionId,
				accepted.revision,
				accepted.acceptedSpecHash!,
			),
		).toThrow("conflicts with accepted admission identity");
		expect(admissions.get(accepted.admissionId)?.state).toBe("ACCEPTED");
	});
});
