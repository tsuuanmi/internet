import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAccountDefinition } from "#internet/core/accounts";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import {
	SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY,
	WorkflowSoftwareRepositoryResearchAdapter,
} from "#internet/workflow/profiles/software/research-capability";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import {
	WorkflowExecutionResultStore,
	WorkflowExecutionStore,
	WorkflowRunCoordinator,
	type WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/index";
import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES, WORKFLOW_SEMANTIC_SCHEMA_REFS } from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

const runId = "7".repeat(32);

function teamRunner(): WorkflowTeamRunner {
	return {
		rounds: 1,
		async runStep(request) {
			if (request.step.kind === "synthesis") {
				return { ok: true, step: request.step, finalAnswer: "implementation-ready repository evidence" };
			}
			return {
				ok: true,
				step: request.step,
				turn: {
					round: request.step.round,
					accountId: request.step.accountId,
					provider: getAccountDefinition(request.step.accountId).provider,
					text: "member repository evidence",
				},
			};
		},
	};
}

function run(): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "8".repeat(32),
		owner: { kind: "service", id: "workflow-service" },
		lifecycle: "CREATED",
		definitions: {
			profile: { id: "software_change", version: "1" },
			policy: { id: "software-test", version: "1" },
			capabilities: [
				{
					id: SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.id,
					version: SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.version,
				},
			],
			schemas: [],
			projection: { id: "software-research-test", version: "1" },
		},
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
}

const policy: WorkflowRuntimePolicy = {
	materializeNeed: () => ({
		kind: "work_item",
		capability: {
			id: SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.id,
			version: SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.version,
		},
	}),
	readiness: () => ({
		ready: true,
		artifacts: [],
		facts: [{ name: "repository", value: "tsuuanmi/internet" }],
		blockers: [],
	}),
	convergence: () => ({
		policy: {
			criteria: [],
			requiredDeliverableTypes: [],
			requiredAuthorityGates: [],
			requiredReceiptIds: [],
			requiredDependencyIds: ["later-software-work"],
			requiredPlanTasks: [],
		},
		state: {
			assessments: [],
			findings: [],
			deliverables: [],
			authorityGates: [],
			receiptIds: [],
			dependencies: [{ id: "later-software-work", resolved: false }],
			planTasks: [],
		},
	}),
};

describe("workflow vNext capability runtime integration", () => {
	it("executes repository research through the Phase 4 coordinator and promotes exact semantic output", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-capability-runtime-"));
		const runs = new WorkflowRunStore(root);
		const artifacts = new WorkflowArtifactStore(root);
		const workItems = new WorkflowWorkItemStore(root);
		const inputBundles = new WorkflowInputBundleStore(root);
		const executions = new WorkflowExecutionStore(root);
		runs.create(run());

		const need = artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
			producer: { kind: "runtime", id: "test" },
			payload: {
				needId: "repository-research-1",
				type: "execution",
				requestOwner: { kind: "plan_task", id: "inspect-repository" },
				requestedCapability: SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.id,
				question: "Inspect the repository and identify the exact implementation surface.",
				subjects: [{ kind: "repository", id: "tsuuanmi/internet" }],
				relatedArtifacts: [],
			},
		});

		const adapter = new WorkflowSoftwareRepositoryResearchAdapter(teamRunner(), artifacts);
		const coordinator = new WorkflowRunCoordinator({
			runs,
			artifacts,
			workItems,
			inputBundles,
			executions,
			results: new WorkflowExecutionResultStore(root),
			capabilities: new WorkflowCapabilityRegistry([SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY]),
			executors: { resolve: () => adapter },
			pendingActions: { ensure: () => ({}) as never, list: () => [], hasOpen: () => false, reconcile: () => undefined },
			policy,
		});

		expect(coordinator.advance(runId).lifecycle).toBe("ACTIVE");
		const [workItemId] = coordinator.runnableWorkItemIds(runId);
		if (workItemId === undefined) throw new Error("expected repository research WorkItem");

		await coordinator.execute(runId, workItemId, "runtime-owner");

		const workItem = workItems.get(runId, workItemId);
		expect(workItem).toEqual(
			expect.objectContaining({
				state: "COMPLETED",
				needArtifact: { runId, artifactId: need.artifactId },
			}),
		);
		const [execution] = executions.list(runId);
		expect(execution?.state).toBe("SUCCEEDED");

		const evidence = artifacts
			.list(runId)
			.find((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence);
		expect(evidence).toEqual(
			expect.objectContaining({
				inputBundleId: workItem?.inputBundleId,
				producer: { kind: "work_item", id: workItemId },
			}),
		);
		expect(evidence?.payload).toMatchObject({
			summary: "implementation-ready repository evidence",
			subjects: [{ kind: "repository", id: "tsuuanmi/internet" }],
		});
	});
});
