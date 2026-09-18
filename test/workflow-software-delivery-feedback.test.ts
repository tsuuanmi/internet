import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import {
	WORKFLOW_EXTERNAL_SIGNAL_SCHEMA,
	WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA,
	WORKFLOW_PENDING_ACTION_SCHEMA,
	type WorkflowExternalSignal,
	type WorkflowPendingAction,
} from "#internet/workflow/interactions/types";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { withSoftwareDeliveryFeedbackPolicy } from "#internet/workflow/profiles/software/delivery-policy";
import { WorkflowSoftwareFeedbackBridge } from "#internet/workflow/profiles/software/feedback-bridge";
import { SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY } from "#internet/workflow/profiles/software/feedback-capability";
import { SOFTWARE_USER_FEEDBACK_SCHEMA } from "#internet/workflow/profiles/software/feedback-contract";
import type { WorkflowNeedRuntimeContext, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
import {
	parseWorkflowNeedPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	WORKFLOW_SEMANTIC_SCHEMA_REFS,
} from "#internet/workflow/semantic/index";

const runId = "9".repeat(32);
const headSha = "a".repeat(40);

function run(): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "8".repeat(32),
		owner: { kind: "session", id: "owner-session" },
		lifecycle: "ACTIVE",
		definitions: {
			profile: { id: "software_change", version: "1" },
			policy: { id: "software-delivery", version: "1" },
			capabilities: [],
			schemas: [SOFTWARE_USER_FEEDBACK_SCHEMA],
			projection: { id: "software-delivery", version: "1" },
		},
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
}

function basePolicy(): WorkflowRuntimePolicy {
	return {
		materializeNeed: () => ({
			kind: "work_item",
			capability: { id: "fallback", version: "1" },
		}),
		readiness: () => ({ ready: true, artifacts: [], facts: [], blockers: [] }),
		convergence: () => ({
			policy: {
				criteria: [],
				requiredDeliverableTypes: [],
				requiredAuthorityGates: [],
				requiredReceiptIds: [],
				requiredDependencyIds: [],
				requiredPlanTasks: [],
			},
			state: {
				assessments: [],
				findings: [],
				deliverables: [],
				authorityGates: [],
				receiptIds: [],
				dependencies: [],
				planTasks: [],
			},
		}),
	};
}

function setup() {
	const root = mkdtempSync(join(tmpdir(), "internet-software-delivery-feedback-"));
	const artifacts = new WorkflowArtifactStore(root);
	const inputBundles = new WorkflowInputBundleStore(root);
	const delivery = artifacts.create({
		runId,
		type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery,
		schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.delivery,
		producer: { kind: "runtime", id: "review" },
		payload: {
			deliveryId: `reviewed:pull-request:tsuuanmi/internet#44@${headSha}`,
			kind: "reviewed_pull_request",
			subject: { kind: "git_head", id: "tsuuanmi/internet#44", version: headSha },
			artifacts: [],
			instructions: "Validate exact reviewed head",
		},
	});
	const validationNeed = artifacts.create({
		runId,
		type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
		schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
		producer: { kind: "runtime", id: "review" },
		payload: {
			needId: "user-validation:44",
			type: "clarification",
			requestOwner: { kind: "delivery", id: "reviewed:pull-request:tsuuanmi/internet#44@" + headSha },
			question: "Validate this delivery",
			subjects: [{ kind: "git_head", id: `tsuuanmi/internet#44@${headSha}` }],
			relatedArtifacts: [],
		},
	});
	return { root, artifacts, inputBundles, delivery, validationNeed };
}

function context(
	artifacts: WorkflowArtifactStore,
	needArtifact: ReturnType<WorkflowArtifactStore["create"]>,
): WorkflowNeedRuntimeContext {
	return {
		run: run(),
		needArtifact,
		need: parseWorkflowNeedPayload(needArtifact.payload),
		artifacts: artifacts.list(runId),
		workItems: [],
		pendingActions: [],
	};
}

describe("software Delivery/User-feedback lifecycle", () => {
	it("materializes reviewed Delivery validation as an exact-bound PendingAction", () => {
		const { artifacts, delivery, validationNeed } = setup();
		const policy = withSoftwareDeliveryFeedbackPolicy(basePolicy());
		const materialization = policy.materializeNeed(context(artifacts, validationNeed));
		expect(materialization).toMatchObject({
			kind: "pending_action",
			actionType: "software.user_validation",
			responderPolicy: "USER_OR_LOCAL",
			responseSchema: SOFTWARE_USER_FEEDBACK_SCHEMA,
			artifactBindings: [{ runId, artifactId: delivery.artifactId }],
			subjectBindings: [
				{
					subject: { kind: "git_head", id: "tsuuanmi/internet#44" },
					version: headSha,
				},
			],
		});
	});

	it("adds exact ImplementationOutput to review readiness without broad prompt context", () => {
		const { artifacts } = setup();
		const output = artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.implementationOutput,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.implementationOutput,
			producer: { kind: "runtime", id: "implementation" },
			payload: {
				outputId: `pull-request:tsuuanmi/internet#45@${headSha}`,
				kind: "pull_request_head",
				subject: { kind: "git_head", id: "tsuuanmi/internet#45", version: headSha },
				artifacts: [],
			},
		});
		const need = artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
			producer: { kind: "runtime", id: "implementation" },
			payload: {
				needId: "review-45",
				type: "execution",
				requestOwner: { kind: "implementation_output", id: "pull-request:tsuuanmi/internet#45@" + headSha },
				requestedCapability: "software.review_current_state",
				question: "Review exact output",
				subjects: [],
				relatedArtifacts: [],
			},
		});
		const policy = withSoftwareDeliveryFeedbackPolicy(basePolicy());
		const decision = policy.readiness(context(artifacts, need), {} as never);
		expect(decision.artifacts).toEqual([{ runId, artifactId: output.artifactId }]);
	});

	it("turns a resolved validation response into targeted UserFeedback plus a reasoning Need", () => {
		const { artifacts, inputBundles, delivery, validationNeed } = setup();
		const bridge = new WorkflowSoftwareFeedbackBridge({ artifacts, inputBundles });
		const action: WorkflowPendingAction = {
			schema: WORKFLOW_PENDING_ACTION_SCHEMA,
			version: 1,
			revision: 2,
			actionId: "b".repeat(32),
			runId,
			causedBy: { runId, artifactId: validationNeed.artifactId },
			requestOwner: { kind: "delivery", id: "reviewed:pull-request:tsuuanmi/internet#44@" + headSha },
			actionType: "software.user_validation",
			prompt: "Validate delivery",
			responderPolicy: "USER_OR_LOCAL",
			responseSchema: SOFTWARE_USER_FEEDBACK_SCHEMA,
			blockingScope: [{ kind: "delivery", id: "reviewed:pull-request:tsuuanmi/internet#44@" + headSha }],
			artifactBindings: [{ runId, artifactId: delivery.artifactId }],
			subjectBindings: [{ subject: { kind: "git_head", id: "tsuuanmi/internet#44" }, version: headSha }],
			timeoutPolicy: "WAIT_INDEFINITELY",
			state: "RESOLVED",
			resolution: {
				schema: WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA,
				version: 1,
				requestId: "feedback-response-1",
				principal: { kind: "session", id: "owner-session" },
				provenance: "user_explicit",
				responseSchema: SOFTWARE_USER_FEEDBACK_SCHEMA,
				payload: { verdict: "CHANGES_REQUESTED", raw: "Please adjust spacing" },
				payloadHash: "c".repeat(64),
				respondedAt: "2026-09-18T01:00:00.000Z",
			},
			createdAt: "2026-09-18T00:30:00.000Z",
			updatedAt: "2026-09-18T01:00:00.000Z",
		};
		bridge.onResolved(action);
		const all = artifacts.list(runId);
		const feedback = all.find((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.userFeedback);
		const need = all.find(
			(artifact) =>
				artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need &&
				parseWorkflowNeedPayload(artifact.payload).requestedCapability ===
					SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY.id,
		);
		expect(feedback?.payload).toMatchObject({
			provenance: "user_explicit",
			raw: "Please adjust spacing",
			targetDelivery: { runId, artifactId: delivery.artifactId },
			targetVersion: headSha,
		});
		expect(need?.payload).toMatchObject({
			type: "execution",
			requestOwner: { kind: "user_feedback" },
			requestedCapability: SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY.id,
		});
	});

	it("rejects unsolicited feedback targeting an obsolete Delivery/head", () => {
		const { artifacts, inputBundles, delivery } = setup();
		const bridge = new WorkflowSoftwareFeedbackBridge({ artifacts, inputBundles });
		artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.evidence,
			producer: { kind: "runtime", id: "new-head" },
			lineage: [{ relation: "invalidates", artifact: { runId, artifactId: delivery.artifactId } }],
			payload: {
				evidenceId: "new-head",
				summary: "A newer PR head exists",
				subjects: [],
				sourceRefs: [],
				relatedArtifacts: [],
			},
		});
		const signal: WorkflowExternalSignal = {
			schema: WORKFLOW_EXTERNAL_SIGNAL_SCHEMA,
			version: 1,
			signalId: "d".repeat(32),
			runId,
			requestId: "signal-1",
			principal: { kind: "session", id: "owner-session" },
			provenance: "user_explicit",
			signalType: "software.user_feedback",
			payloadSchema: SOFTWARE_USER_FEEDBACK_SCHEMA,
			payload: {
				verdict: "CHANGES_REQUESTED",
				raw: "This old head is wrong",
				targetDelivery: { runId, artifactId: delivery.artifactId },
				targetVersion: headSha,
			},
			payloadHash: "e".repeat(64),
			expectedRunRevision: 1,
			createdAt: "2026-09-18T01:00:00.000Z",
		};
		expect(() => bridge.onSignal(signal)).toThrow("obsolete Delivery");
	});
});
