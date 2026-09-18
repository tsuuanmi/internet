import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { type WorkflowCapabilityDescriptor, WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import {
	WORKFLOW_EXECUTION_SCHEMA,
	WorkflowExecutionResultStore,
	WorkflowExecutionStore,
	WorkflowRunCoordinator,
	type WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/index";
import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES } from "#internet/workflow/semantic/index";
import { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

const runId = "1".repeat(32);
const capability: WorkflowCapabilityDescriptor = {
	id: "test-execution",
	version: "1",
	acceptedNeedTypes: ["execution"],
	producedArtifactTypes: [],
	producedReceiptTypes: [],
	sideEffect: "READ_ONLY",
	requiredAuthority: [],
	executorKinds: ["test"],
	inputSchema: { id: "test-input", version: "1" },
	outputSchema: { id: "test-output", version: "1" },
	policyHooks: [],
};

function workflowRun(): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "2".repeat(32),
		owner: { kind: "service", id: "workflow-service" },
		lifecycle: "CREATED",
		definitions: {
			profile: { id: "test", version: "1" },
			policy: { id: "test", version: "1" },
			capabilities: [{ id: capability.id, version: capability.version }],
			schemas: [],
			projection: { id: "test-projection", version: "1" },
		},
		createdAt: "2026-09-17T10:00:00.000Z",
		updatedAt: "2026-09-17T10:00:00.000Z",
	};
}

function policy(blockers: readonly string[] = []): WorkflowRuntimePolicy {
	return {
		materializeNeed: () => ({
			kind: "work_item",
			capability: { id: capability.id, version: capability.version },
		}),
		readiness: () => ({ ready: true, artifacts: [], facts: [{ name: "scope", value: "exact" }], blockers }),
		convergence: () => ({
			policy: {
				criteria: [],
				requiredDeliverableTypes: [],
				requiredAuthorityGates: [],
				requiredReceiptIds: [],
				requiredDependencyIds: ["hold"],
				requiredPlanTasks: [],
			},
			state: {
				assessments: [],
				findings: [],
				deliverables: [],
				authorityGates: [],
				receiptIds: [],
				dependencies: [{ id: "hold", resolved: false }],
				planTasks: [],
			},
		}),
	};
}

function fixture(runtimePolicy = policy()) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-runtime-"));
	const runs = new WorkflowRunStore(root);
	const artifacts = new WorkflowArtifactStore(root);
	const workItems = new WorkflowWorkItemStore(root);
	const inputBundles = new WorkflowInputBundleStore(root);
	runs.create(workflowRun());
	const need = artifacts.create({
		runId,
		type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
		schemaRef: { id: "workflow-need", version: "1" },
		producer: { kind: "runtime", id: "test" },
		payload: {
			needId: "need-1",
			type: "execution",
			requestOwner: { kind: "workflow_run", id: runId },
			requestedCapability: capability.id,
			question: "Run exact work",
			subjects: [],
			relatedArtifacts: [],
		},
	});
	const executions = new WorkflowExecutionStore(root);
	const coordinator = new WorkflowRunCoordinator({
		runs,
		artifacts,
		workItems,
		inputBundles,
		executions,
		results: new WorkflowExecutionResultStore(root),
		capabilities: new WorkflowCapabilityRegistry([capability]),
		executors: { resolve: () => ({ kind: "test", execute: async () => ({}) as never }) },
		pendingActions: { ensure: () => undefined, hasOpen: () => false },
		policy: runtimePolicy,
	});
	return { coordinator, need, artifacts, workItems, inputBundles, executions };
}

describe("workflow vNext run coordinator", () => {
	it("materializes a typed Need into one READY WorkItem with an exact InputBundle", () => {
		const { coordinator, need, workItems, inputBundles } = fixture();
		expect(coordinator.advance(runId).lifecycle).toBe("ACTIVE");
		const [item] = workItems.list(runId);
		expect(item).toEqual(
			expect.objectContaining({ state: "READY", needArtifact: { runId, artifactId: need.artifactId } }),
		);
		expect(item?.inputBundleId).toBeDefined();
		const bundle = inputBundles.get(runId, item?.inputBundleId ?? "");
		expect(bundle?.artifacts).toContainEqual({ runId, artifactId: need.artifactId });
		expect(bundle?.facts).toEqual([{ name: "scope", value: "exact" }]);
		expect(workItems.list(runId)).toHaveLength(1);
		coordinator.advance(runId);
		expect(workItems.list(runId)).toHaveLength(1);
	});

	it("fences stale running work before restart reconciliation", async () => {
		const { coordinator, need, artifacts, workItems, inputBundles, executions } = fixture();
		coordinator.advance(runId);
		const item = workItems.list(runId)[0];
		if (item?.inputBundleId === undefined) throw new Error("expected ready WorkItem");
		const startedAt = "2026-09-18T00:00:00.000Z";
		const executionId = "6".repeat(32);
		workItems.update(runId, item.workItemId, item.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "RUNNING",
			executionIds: [...current.executionIds, executionId],
			updatedAt: startedAt,
		}));
		executions.create({
			schema: WORKFLOW_EXECUTION_SCHEMA,
			version: 1,
			revision: 1,
			executionId,
			runId,
			workItemId: item.workItemId,
			inputBundleId: item.inputBundleId,
			capability: item.capability,
			attempt: 1,
			ownerInstanceId: "runtime-1",
			state: "RUNNING",
			startedAt,
			heartbeatAt: startedAt,
			leaseUntil: "2099-01-01T00:00:00.000Z",
		});
		const replacement = artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: { id: "workflow-need", version: "1" },
			producer: { kind: "runtime", id: "test" },
			lineage: [{ relation: "supersedes", artifact: { runId, artifactId: need.artifactId } }],
			payload: {
				needId: "need-2",
				type: "execution",
				requestOwner: { kind: "workflow_run", id: runId },
				requestedCapability: capability.id,
				question: "Run replacement work",
				subjects: [],
				relatedArtifacts: [],
			},
		});

		await coordinator.reconcile(runId);

		expect(executions.get(runId, executionId)).toEqual(
			expect.objectContaining({
				state: "FENCED",
				failure: expect.objectContaining({ code: "INPUT_INVALIDATED" }),
			}),
		);
		expect(workItems.get(runId, item.workItemId)?.state).toBe("FENCED");
		const replacementItem = workItems
			.list(runId)
			.find((candidate) => candidate.needArtifact.artifactId === replacement.artifactId);
		expect(replacementItem?.state).toBe("READY");
		expect(inputBundles.get(runId, replacementItem?.inputBundleId ?? "")).toBeDefined();
	});

	it("rejects contradictory readiness instead of constructing an ambiguous InputBundle", () => {
		const { coordinator } = fixture(policy(["dependency missing"]));
		expect(() => coordinator.advance(runId)).toThrow("readiness cannot be ready with blockers");
	});
});
