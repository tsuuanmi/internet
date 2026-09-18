import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowAdmissionActivationRegistry } from "#internet/workflow/admission/activation-registry";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { WorkflowDurableAwaitableRuntime } from "#internet/workflow/awaitables/runtime";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { workflowSessionAuthorizationContext } from "#internet/workflow/authorization";
import { resolveWorkflowProfileAvailability } from "#internet/workflow/bootstrap";
import { WorkflowExternalEventStore } from "#internet/workflow/external-event-store";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import { createResearchAdmissionDraft } from "#internet/workflow/profiles/research/admission";
import { createResearchWorkflowActivationHandler } from "#internet/workflow/profiles/research/activation";
import { createWorkflowResearchPolicy } from "#internet/workflow/profiles/research/policy";
import { RESEARCH_WORKFLOW_PROFILE } from "#internet/workflow/profiles/research/profile";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowService } from "#internet/workflow/service";
import { WorkflowTimerStore } from "#internet/workflow/timer-store";
import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES } from "#internet/workflow/semantic/index";

describe("workflow deep_research profile", () => {
	it("is available with thinker capabilities even when no Writer account is available", () => {
		const availability = resolveWorkflowProfileAvailability(
			new Set(["chatgpt-thinker", "chatgpt-thinker-2"] as const),
		);
		expect(availability).toEqual({ software: false, research: true });
	});

	it("keeps round two behind a persisted Timer until its deadline fires", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-research-policy-"));
		const artifacts = new WorkflowArtifactStore(root);
		const inputBundles = new WorkflowInputBundleStore(root);
		const timers = new WorkflowTimerStore(root);
		const awaitables = new WorkflowDurableAwaitableRuntime(
			timers,
			new WorkflowExternalEventStore(root),
		);
		const policy = createWorkflowResearchPolicy(artifacts, inputBundles, awaitables, {
			maxRounds: 2,
			refreshDelayMs: 60_000,
		});
		const runId = "a".repeat(32);
		const needArtifact = artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: { id: "workflow.need", version: "1" },
			producer: { kind: "runtime", id: "round-two" },
			payload: {
				needId: "research-round:2",
				type: "execution",
				requestOwner: { kind: "research_round", id: "2" },
				requestedCapability: "research.external_deep_research",
				question: "Refresh the research",
				subjects: [{ kind: "workflow_run", id: runId }],
				relatedArtifacts: [],
			},
		});
		const run = {
			schema: "@tsuuanmi/internet-workflow-run" as const,
			version: 1 as const,
			revision: 1,
			runId,
			admissionId: "b".repeat(32),
			owner: { kind: "session" as const, id: "owner" },
			lifecycle: "ACTIVE" as const,
			definitions: {
				profile: { id: "deep_research", version: "1" },
				policy: { id: "research.multi_round", version: "1" },
				capabilities: [],
				schemas: [],
				projection: { id: "research.default", version: "1" },
			},
			createdAt: needArtifact.createdAt,
			updatedAt: needArtifact.createdAt,
		};
		const context = {
			run,
			needArtifact,
			need: needArtifact.payload as never,
			artifacts: artifacts.list(runId),
			workItems: [],
			pendingActions: [],
		};

		const waiting = policy.materializeNeed(context);
		expect(waiting).toMatchObject({ kind: "timer", timerType: "research.refresh" });
		if (waiting.kind !== "timer") throw new Error("expected research Timer");
		const timer = awaitables.ensureTimer(runId, { runId, artifactId: needArtifact.artifactId }, waiting);
		expect(timer.state).toBe("PENDING");

		awaitables.reconcile(runId, () => Date.parse(timer.deadline) + 1);
		const ready = policy.materializeNeed(context);
		expect(ready).toEqual({
			kind: "work_item",
			capability: { id: "research.external_deep_research", version: "1" },
		});
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
