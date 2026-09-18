import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowAdmissionActivationRegistry } from "#internet/workflow/admission/activation-registry";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
import { resolveWorkflowProfileAvailability } from "#internet/workflow/bootstrap";
import { createResearchAdmissionDraft } from "#internet/workflow/profiles/research/admission";
import { createResearchWorkflowActivationHandler } from "#internet/workflow/profiles/research/activation";
import { RESEARCH_WORKFLOW_PROFILE } from "#internet/workflow/profiles/research/profile";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowService } from "#internet/workflow/service";
import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES } from "#internet/workflow/semantic/index";

describe("workflow deep_research profile", () => {
	it("is available with thinker capabilities even when no Writer account is available", () => {
		const availability = resolveWorkflowProfileAvailability(
			new Set(["chatgpt-thinker", "chatgpt-thinker-2"] as const),
		);
		expect(availability).toEqual({ software: false, research: true });
	});

	it("activates a vNext research run without constructing any legacy software runtime", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-research-activation-"));
		const runs = new WorkflowRunStore(root);
		const artifacts = new WorkflowArtifactStore(root);
		const driver = { enqueue: () => undefined, isActive: () => false };
		const activation = createResearchWorkflowActivationHandler(runs, artifacts, driver);
		const admissions = new WorkflowAdmissionService(
			new WorkflowAdmissionStore(root),
			new WorkflowProfileRegistry([RESEARCH_WORKFLOW_PROFILE], RESEARCH_WORKFLOW_PROFILE.id),
			{
				createId: (() => {
					const ids = ["1".repeat(32), "2".repeat(32)];
					return () => ids.shift() ?? "f".repeat(32);
				})(),
				now: () => new Date("2026-09-18T00:00:00.000Z"),
			},
		);
		const service = new WorkflowService({
			admissionService: admissions,
			activationRegistry: new WorkflowAdmissionActivationRegistry([activation]),
		});
		const context = workflowSessionAuthorizationContext("research-session");
		const admitted = service.admit(
			context,
			createResearchAdmissionDraft({
				rawSource: "Research durable orchestration approaches",
				sourceProvenance: "user_explicit",
			}),
		);
		expect(admitted.state).toBe("ACCEPTED");
		const resource = service.activateAdmissionTarget(context, admitted.admissionId, admitted.acceptedSpecHash!);
		expect(resource.kind).toBe("workflow_run");
		if (resource.kind !== "workflow_run") throw new Error("expected research WorkflowRun");
		expect(resource.run.owner).toEqual(context.principal);
		expect(resource.run.definitions.profile).toEqual({ id: "deep_research", version: "1" });
		expect(resource.run.lifecycle).toBe("CREATED");
		const types = artifacts.list(resource.run.runId).map((artifact) => artifact.type).sort();
		expect(types).toEqual(
			[
				WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
				WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
				WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective,
			].sort(),
		);
		expect(() => service.activateAdmission(context, admitted.admissionId, admitted.acceptedSpecHash!)).toThrow(
			"activated a vNext WorkflowRun",
		);
	});
});
