import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import { WorkflowAdmissionActivationRegistry } from "#internet/workflow/admission/activation-registry";
import { canonicalAdmissionJson, hashAdmissionValue } from "#internet/workflow/admission/hash";
import { WorkflowAdmissionService, WorkflowAdmissionServiceError } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore, WorkflowAdmissionStoreError } from "#internet/workflow/admission/store";
import type { AcceptedAdmissionSpec } from "#internet/workflow/admission/types";
import { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { createSoftwareWorkflowActivationHandler } from "#internet/workflow/profiles/software-activation";
import { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
import { SOFTWARE_WORKFLOW_PROFILE } from "#internet/workflow/profiles/software-profile";
import { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService } from "#internet/workflow/service";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const REVISION = "0123456789abcdef0123456789abcdef01234567";
const IDS = [
	"00000000000000000000000000000001",
	"00000000000000000000000000000002",
	"00000000000000000000000000000003",
	"00000000000000000000000000000004",
] as const;

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-admission-"));
	roots.push(path);
	return path;
}

function profiles(): WorkflowProfileRegistry {
	return new WorkflowProfileRegistry([SOFTWARE_WORKFLOW_PROFILE], SOFTWARE_WORKFLOW_PROFILE.id);
}

function admissionService(path: string, start = 0): WorkflowAdmissionService {
	let index = start;
	return new WorkflowAdmissionService(new WorkflowAdmissionStore(path), profiles(), {
		now: () => new Date("2026-09-17T00:00:00.000Z"),
		createId: () => IDS[index++] ?? "0000000000000000000000000000000f",
	});
}

function softwareDraft(sourceProvenance: "user_explicit" | "local_interpreted" = "user_explicit") {
	return createSoftwareAdmissionDraft({
		rawSource: "Add deterministic admission",
		sourceProvenance,
		repository: "https://github.com/example/repo",
		baseRevision: REVISION,
		targetProvenance: "system_observed",
		authorityProvenance: sourceProvenance,
	});
}

function recordingActivator(expectedHash: string): {
	readonly activator: WorkflowAdmissionActivator;
	readonly seen: AcceptedAdmissionSpec[];
} {
	const seen: AcceptedAdmissionSpec[] = [];
	return {
		seen,
		activator: {
			target(spec) {
				return { targetKind: "workflow_job", targetId: spec.admissionId };
			},
			ensure(spec, target) {
				expect(hashAdmissionValue(spec)).toBe(expectedHash);
				expect(target).toEqual({ targetKind: "workflow_job", targetId: spec.admissionId });
				seen.push(spec);
			},
		},
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workflow admission", () => {
	it("hashes canonical object content independently of object key order", () => {
		const left = { z: 1, nested: { b: true, a: "x" }, list: [{ y: 2, x: 1 }] };
		const right = { list: [{ x: 1, y: 2 }], nested: { a: "x", b: true }, z: 1 };

		expect(canonicalAdmissionJson(left)).toBe(canonicalAdmissionJson(right));
		expect(hashAdmissionValue(left)).toBe(hashAdmissionValue(right));
	});

	it("auto-accepts explicit software input and activates only the exact accepted spec", () => {
		const path = root();
		const service = admissionService(path);
		const owner = { kind: "session", id: "session-a" } as const;
		const created = service.create(owner, softwareDraft());
		const accepted = service.preflight(owner, created.admissionId, created.revision);

		expect(accepted.state).toBe("ACCEPTED");
		expect(accepted.preview?.confirmation.level).toBe("AUTO_SUBMIT");
		expect(accepted.confirmation?.provenance).toBe("policy_default");
		expect(accepted.acceptedSpec?.draft.source.provenance).toBe("user_explicit");
		expect(accepted.acceptedSpecHash).toMatch(/^[0-9a-f]{64}$/u);

		const exactHash = accepted.acceptedSpecHash!;
		const { activator, seen } = recordingActivator(exactHash);
		expect(() => service.activate(owner, accepted.admissionId, "0".repeat(64), activator)).toThrow(
			"accepted admission identity changed before activation",
		);

		const activated = service.activate(owner, accepted.admissionId, exactHash, activator);
		expect(activated.state).toBe("ACTIVATED");
		expect(activated.activation).toMatchObject({
			targetKind: "workflow_job",
			targetId: accepted.admissionId,
			acceptedSpecHash: exactHash,
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]?.draft.source.rawText).toBe("Add deterministic admission");
	});

	it("persists Local confirmation across service reconstruction", () => {
		const path = root();
		const owner = { kind: "session", id: "session-a" } as const;
		const first = admissionService(path);
		const created = first.create(owner, softwareDraft("local_interpreted"));
		const waiting = first.preflight(owner, created.admissionId, created.revision);

		expect(waiting.state).toBe("AWAITING_CONFIRMATION");
		expect(waiting.preview?.confirmation.level).toBe("LOCAL_CONFIRM");

		const reconstructed = admissionService(path, 2);
		const loaded = reconstructed.get(owner, waiting.admissionId);
		expect(loaded).toMatchObject({ state: "AWAITING_CONFIRMATION", draftHash: waiting.draftHash });
		const accepted = reconstructed.confirm(owner, waiting.admissionId, waiting.revision, {
			expectedDraftHash: waiting.draftHash,
			provenance: "local_interpreted",
		});
		expect(accepted.state).toBe("ACCEPTED");
		expect(accepted.confirmation?.provenance).toBe("local_interpreted");
	});

	it("requires explicit User provenance for policy-required User confirmation", () => {
		const path = root();
		const owner = { kind: "session", id: "session-a" } as const;
		const service = admissionService(path);
		const created = service.create(owner, {
			...softwareDraft(),
			temporal: {
				duration: { value: "P3D", provenance: "local_interpreted" },
			},
		});
		const waiting = service.preflight(owner, created.admissionId, created.revision);

		expect(waiting.preview?.confirmation.level).toBe("USER_CONFIRM");
		expect(() =>
			service.confirm(owner, waiting.admissionId, waiting.revision, {
				expectedDraftHash: waiting.draftHash,
				provenance: "local_interpreted",
			}),
		).toThrowError(new WorkflowAdmissionServiceError("admission requires explicit User confirmation"));

		const accepted = service.confirm(owner, waiting.admissionId, waiting.revision, {
			expectedDraftHash: waiting.draftHash,
			provenance: "user_explicit",
		});
		expect(accepted.state).toBe("ACCEPTED");
		expect(accepted.confirmation?.provenance).toBe("user_explicit");
	});

	it("fails closed when the confirmation draft identity is stale", () => {
		const path = root();
		const owner = { kind: "session", id: "session-a" } as const;
		const service = admissionService(path);
		const created = service.create(owner, softwareDraft("local_interpreted"));
		const waiting = service.preflight(owner, created.admissionId, created.revision);

		expect(() =>
			service.confirm(owner, waiting.admissionId, waiting.revision, {
				expectedDraftHash: "f".repeat(64),
				provenance: "local_interpreted",
			}),
		).toThrow("admission draft changed before confirmation; re-preflight is required");
		expect(service.get(owner, waiting.admissionId)?.state).toBe("AWAITING_CONFIRMATION");
	});

	it("uses optimistic revision control for durable admission updates", () => {
		const path = root();
		const owner = { kind: "session", id: "session-a" } as const;
		const service = admissionService(path);
		const created = service.create(owner, softwareDraft());
		service.preflight(owner, created.admissionId, created.revision);

		expect(() => service.preflight(owner, created.admissionId, created.revision)).toThrowError(
			WorkflowAdmissionStoreError,
		);
	});

	it("auto-submits software execution only through an activated durable admission", () => {
		const path = root();
		const runtime = createWorkflowTestRuntime(path);
		const driver = {
			enqueue() {},
			async cancel(jobId: string) {
				return runtime.engine.cancel(jobId);
			},
			isActive() {
				return false;
			},
		};
		const admissions = admissionService(path);
		const retention = new WorkflowRetentionManager(path, runtime.jobs);
		const workflow = new WorkflowService({
			admissionService: admissions,
			activationRegistry: new WorkflowAdmissionActivationRegistry([
				createSoftwareWorkflowActivationHandler(runtime.engine, driver, runtime.jobs),
			]),
			legacy: { engine: runtime.engine, driver, jobs: runtime.jobs, retention },
		});
		const authorization = workflowSessionAuthorizationContext("session-a");
		const job = workflow.autoSubmit(authorization, softwareDraft());

		expect(job).toMatchObject({
			jobId: expect.any(String),
			ownerSessionId: "session-a",
			objective: "Add deterministic admission",
			repository: "https://github.com/example/repo",
			baseRevision: REVISION,
		});
		const records = admissions.list(authorization.principal);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			state: "ACTIVATED",
			activation: { targetKind: "workflow_job", targetId: job.jobId },
		});
		expect(records[0]?.acceptedSpec?.draft.source.provenance).toBe("user_explicit");
	});
});
