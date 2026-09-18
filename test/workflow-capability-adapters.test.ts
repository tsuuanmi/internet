import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAccountDefinition } from "#internet/core/accounts";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import {
	WORKFLOW_INPUT_BUNDLE_SCHEMA,
	WORKFLOW_RUN_SCHEMA,
	WORKFLOW_WORK_ITEM_SCHEMA,
	type WorkflowInputBundle,
	type WorkflowRun,
	type WorkflowWorkItem,
} from "#internet/workflow/kernel/types";
import {
	WorkflowPlanningCapabilityAdapter,
	WorkflowTeamPlanningExecutor,
} from "#internet/workflow/profiles/common/planning-capability";
import {
	EXTERNAL_DEEP_RESEARCH_CAPABILITY,
	WorkflowExternalDeepResearchAdapter,
} from "#internet/workflow/profiles/research/deep-research-capability";
import {
	SOFTWARE_IMPLEMENTATION_CAPABILITY,
	WorkflowSoftwareImplementationAdapter,
} from "#internet/workflow/profiles/software/implementation-capability";
import {
	SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY,
	WorkflowSoftwareRepositoryResearchAdapter,
} from "#internet/workflow/profiles/software/research-capability";
import {
	SOFTWARE_REVIEW_CAPABILITY,
	WorkflowSoftwareReviewAdapter,
} from "#internet/workflow/profiles/software/review-capability";
import {
	WORKFLOW_EXECUTION_SCHEMA,
	type WorkflowCapabilityActiveExecutionContext,
	type WorkflowExecution,
} from "#internet/workflow/runtime/types";
import {
	WORKFLOW_PLANNING_CAPABILITY,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	WORKFLOW_SEMANTIC_SCHEMA_REFS,
} from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const runId = "1".repeat(32);
const workItemId = "2".repeat(32);
const executionId = "3".repeat(32);
const bundleId = "4".repeat(64);

function teamRunner(finalAnswer: string): WorkflowTeamRunner {
	return {
		rounds: 1,
		async runStep(request) {
			if (request.step.kind === "synthesis") return { ok: true, step: request.step, finalAnswer };
			return {
				ok: true,
				step: request.step,
				turn: {
					round: request.step.round,
					accountId: request.step.accountId,
					provider: getAccountDefinition(request.step.accountId).provider,
					text: "member evidence",
				},
			};
		},
	};
}

function createNeed(
	store: WorkflowArtifactStore,
	type: "execution" | "clarification",
	question: string,
	requestedCapability?: string,
) {
	return store.create({
		runId,
		type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
		schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
		producer: { kind: "runtime", id: "test" },
		payload: {
			needId: "need-1",
			type,
			requestOwner: { kind: "run", id: runId },
			...(requestedCapability === undefined ? {} : { requestedCapability }),
			question,
			subjects: [{ kind: "repository", id: "tsuuanmi/internet" }],
			relatedArtifacts: [],
		},
	});
}

function context(
	capability: WorkflowCapabilityDescriptor,
	needArtifactId: string,
	facts: WorkflowInputBundle["facts"] = [],
): WorkflowCapabilityActiveExecutionContext {
	const run: WorkflowRun = {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "5".repeat(32),
		owner: { kind: "session", id: "owner-session" },
		lifecycle: "ACTIVE",
		definitions: {
			profile: { id: "software_change", version: "1" },
			policy: { id: "test-policy", version: "1" },
			capabilities: [{ id: capability.id, version: capability.version }],
			schemas: [],
			projection: { id: "test-projection", version: "1" },
		},
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
	const inputBundle: WorkflowInputBundle = {
		schema: WORKFLOW_INPUT_BUNDLE_SCHEMA,
		version: 1,
		bundleId,
		runId,
		workItemId,
		capability: { id: capability.id, version: capability.version },
		projection: { id: "test-projection", version: "1" },
		artifacts: [{ runId, artifactId: needArtifactId }],
		facts,
		createdAt: "2026-09-18T00:00:00.000Z",
	};
	const workItem: WorkflowWorkItem = {
		schema: WORKFLOW_WORK_ITEM_SCHEMA,
		version: 1,
		revision: 2,
		workItemId,
		runId,
		needArtifact: { runId, artifactId: needArtifactId },
		needId: "need-1",
		requestOwner: { kind: "run", id: runId },
		capability: { id: capability.id, version: capability.version },
		sideEffect: capability.sideEffect,
		state: "RUNNING",
		inputBundleId: bundleId,
		executionIds: [executionId],
		resultArtifactIds: [],
		receiptIds: [],
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
	const execution: WorkflowExecution = {
		schema: WORKFLOW_EXECUTION_SCHEMA,
		version: 1,
		revision: 1,
		executionId,
		runId,
		workItemId,
		inputBundleId: bundleId,
		capability: { id: capability.id, version: capability.version },
		attempt: 1,
		ownerInstanceId: "runtime-owner",
		state: "RUNNING",
		startedAt: "2026-09-18T00:00:00.000Z",
		heartbeatAt: "2026-09-18T00:00:00.000Z",
		leaseUntil: "2026-09-18T01:00:00.000Z",
	};
	return { run, workItem, execution, inputBundle, heartbeat: () => execution };
}

describe("workflow vNext capability adapters", () => {
	it("runs planning through the reasoning adapter and returns typed semantic drafts", async () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-capability-planning-")));
		const need = createNeed(store, "clarification", "Ask the user for the missing scope", "planning");
		const planningOutput = JSON.stringify({
			mode: "CLARIFICATION",
			needs: [
				{
					needId: "clarification-2",
					type: "clarification",
					requestOwner: { kind: "run", id: runId },
					question: "Which target should be changed?",
					subjects: [],
					relatedArtifacts: [],
				},
			],
			findings: [],
		});
		const adapter = new WorkflowPlanningCapabilityAdapter(
			new WorkflowTeamPlanningExecutor(teamRunner(planningOutput), store),
			store,
		);
		const result = await adapter.execute(context(WORKFLOW_PLANNING_CAPABILITY, need.artifactId));
		expect(result.artifacts).toHaveLength(1);
		expect(result.artifacts[0]?.type).toBe(WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need);
	});

	it("projects exact repository-research input through WorkflowTeamRunner", async () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-capability-research-")));
		const need = createNeed(store, "execution", "Inspect the repository", SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY.id);
		const adapter = new WorkflowSoftwareRepositoryResearchAdapter(teamRunner("repository evidence"), store);
		const result = await adapter.execute(context(SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY, need.artifactId));
		expect(result.artifacts[0]).toMatchObject({
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
			payload: { summary: "repository evidence" },
		});
	});

	it("keeps exact-head review inside the software adapter", async () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-capability-review-")));
		const need = createNeed(store, "execution", "Review the current PR head", SOFTWARE_REVIEW_CAPABILITY.id);
		const headSha = "a".repeat(40);
		const adapter = new WorkflowSoftwareReviewAdapter(
			teamRunner(JSON.stringify({ verdict: "CHANGES_REQUIRED", reviewedHeadSha: headSha })),
			store,
		);
		const result = await adapter.execute(context(SOFTWARE_REVIEW_CAPABILITY, need.artifactId));
		expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
			WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
			WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
		]);
		expect(result.artifacts[1]?.payload).toMatchObject({ severity: "blocking" });
	});

	it("wraps WorkflowWriterRunner mutation output as Delivery plus a separate receipt reference", async () => {
		const writer: WorkflowWriterRunner = {
			deliverExact: async () => ({ conversationUrl: "https://chatgpt.com/c/test" }),
			runControl: async () => ({
				status: "PR_OPEN",
				conversationUrl: "https://chatgpt.com/c/test",
				pullRequest: {
					repository: "tsuuanmi/internet",
					number: 42,
					url: "https://github.com/tsuuanmi/internet/pull/42",
					base: "main",
					head: "workflow/test",
					headSha: "b".repeat(40),
				},
			}),
		};
		const adapter = new WorkflowSoftwareImplementationAdapter(writer, () => ({}) as never);
		const ctx = context(SOFTWARE_IMPLEMENTATION_CAPABILITY, "c".repeat(64));
		const result = await adapter.execute(ctx);
		expect(result.artifacts[0]?.type).toBe(WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery);
		expect(result.receiptIds).toEqual([`software.pull_request:tsuuanmi/internet#42@${"b".repeat(40)}`]);
	});

	it("uses BrowserManager.research below the deep-research capability boundary", async () => {
		const store = new WorkflowArtifactStore(mkdtempSync(join(tmpdir(), "internet-capability-deep-")));
		const need = createNeed(
			store,
			"execution",
			"Research the external evidence",
			EXTERNAL_DEEP_RESEARCH_CAPABILITY.id,
		);
		const browser = {
			research: async () => ({
				text: "deep research report",
				url: "https://chatgpt.com/c/research",
				conversationId: "research",
			}),
		};
		const adapter = new WorkflowExternalDeepResearchAdapter(browser as never, "chatgpt-thinker", store);
		const result = await adapter.execute(context(EXTERNAL_DEEP_RESEARCH_CAPABILITY, need.artifactId));
		expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
			WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
			WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report,
		]);
	});
});
