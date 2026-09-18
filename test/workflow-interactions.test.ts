import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { type WorkflowAuthorizationContext, workflowPrincipalEquals } from "#internet/workflow/authorization";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import {
	type WorkflowInteractionAuthorityPolicy,
	WorkflowInteractionService,
	WorkflowInteractionServiceError,
	type WorkflowResponseSchemaRegistry,
} from "#internet/workflow/interactions/service";
import { WorkflowExternalSignalStore } from "#internet/workflow/interactions/signal-store";
import type { WorkflowPendingActionContract } from "#internet/workflow/interactions/types";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowPendingActionStore } from "#internet/workflow/pending-action-store";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES, WORKFLOW_SEMANTIC_SCHEMA_REFS } from "#internet/workflow/semantic/index";

const runId = "a".repeat(32);
const owner = { kind: "session" as const, id: "owner-session" };
const context: WorkflowAuthorizationContext = { principal: owner, ownerSessionId: owner.id };
const responseSchema = { id: "workflow.interaction.choice", version: "1" };

function run(): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "b".repeat(32),
		owner,
		lifecycle: "ACTIVE",
		definitions: {
			profile: { id: "test", version: "1" },
			policy: { id: "test", version: "1" },
			capabilities: [],
			schemas: [responseSchema],
			projection: { id: "test", version: "1" },
		},
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-interaction-"));
	const runs = new WorkflowRunStore(root);
	const artifacts = new WorkflowArtifactStore(root);
	const inputBundles = new WorkflowInputBundleStore(root);
	const actions = new WorkflowPendingActionStore(root);
	runs.create(run());
	const need = artifacts.create({
		runId,
		type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
		schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
		producer: { kind: "runtime", id: "test" },
		payload: {
			needId: "clarification-1",
			type: "clarification",
			requestOwner: { kind: "plan_task", id: "task-1" },
			question: "Preserve compatibility?",
			subjects: [{ kind: "repository", id: "tsuuanmi/internet" }],
			relatedArtifacts: [],
		},
	});
	const authority: WorkflowInteractionAuthorityPolicy = {
		canAccess: (_runId, expectedOwner, caller) => workflowPrincipalEquals(expectedOwner, caller),
		authorizeResponse: (_runId, expectedOwner, caller) => workflowPrincipalEquals(expectedOwner, caller),
		authorizeSignal: (_runId, expectedOwner, caller) => workflowPrincipalEquals(expectedOwner, caller),
	};
	const schemas: WorkflowResponseSchemaRegistry = {
		validate(schema, payload) {
			if (schema.id !== responseSchema.id || schema.version !== responseSchema.version) {
				throw new Error("unsupported test response schema");
			}
			if (
				typeof payload !== "object" ||
				payload === null ||
				Array.isArray(payload) ||
				!["preserve", "break"].includes((payload as { choice?: unknown }).choice as string)
			) {
				throw new Error("invalid test response payload");
			}
		},
	};
	const signals = new WorkflowExternalSignalStore(root);
	const service = new WorkflowInteractionService({
		runs,
		actions,
		artifacts,
		inputBundles,
		schemas,
		authority,
		subjects: { isCurrent: () => true },
		signals,
	});
	const contract: WorkflowPendingActionContract = {
		actionType: "clarification",
		responderPolicy: "USER_OR_LOCAL",
		responseSchema,
		blockingScope: [{ kind: "plan_task", id: "task-1" }],
	};
	const action = actions.ensure({ run: run(), needArtifact: need, need: need.payload as never, contract });
	return { root, runs, artifacts, inputBundles, actions, signals, service, need, action, contract };
}

describe("workflow durable PendingAction protocol", () => {
	it("creates stable independent actions and keeps their contracts durable", () => {
		const { actions, need, action, contract } = fixture();
		const same = actions.ensure({ run: run(), needArtifact: need, need: need.payload as never, contract });
		const second = actions.ensure({
			run: run(),
			needArtifact: need,
			need: need.payload as never,
			contract: { ...contract, actionType: "secondary-choice" },
		});
		expect(same.actionId).not.toBe("");
		expect(same.actionId).toBe(action.actionId);
		expect(second.actionId).not.toBe(same.actionId);
		expect(actions.list(runId)).toHaveLength(2);
	});

	it("accepts an identical response retry idempotently and rejects a conflicting retry", () => {
		const { service, action } = fixture();
		const request = {
			runId,
			actionId: action.actionId,
			expectedRevision: action.revision,
			requestId: "response-1",
			provenance: "local_agent" as const,
			responseSchema,
			payload: { choice: "preserve" },
		};
		const first = service.respond(context, request);
		expect(first.state).toBe("RESOLVED");
		const replay = service.respond(context, request);
		expect(replay).toEqual(first);
		expect(() =>
			service.respond(context, {
				...request,
				expectedRevision: first.revision,
				payload: { choice: "break" },
			}),
		).toThrow("already resolved with a different response");
	});

	it("fails closed when Local Agent provenance attempts to satisfy USER_AUTHORITY", () => {
		const { actions, service, need } = fixture();
		const action = actions.ensure({
			run: run(),
			needArtifact: need,
			need: need.payload as never,
			contract: {
				actionType: "authority",
				responderPolicy: "USER_AUTHORITY",
				responseSchema,
				blockingScope: [{ kind: "gate", id: "publish" }],
			},
		});
		expect(() =>
			service.respond(context, {
				runId,
				actionId: action.actionId,
				expectedRevision: action.revision,
				requestId: "response-authority",
				provenance: "local_agent",
				responseSchema,
				payload: { choice: "preserve" },
			}),
		).toThrow("does not satisfy USER_AUTHORITY");
	});

	it("supersedes an action and rejects its response when an exact artifact binding becomes stale", () => {
		const { artifacts, actions, service, need, action } = fixture();
		artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
			producer: { kind: "runtime", id: "test" },
			lineage: [{ relation: "supersedes", artifact: { runId, artifactId: need.artifactId } }],
			payload: {
				...(need.payload as Record<string, unknown>),
				needId: "clarification-2",
				question: "Updated clarification",
			},
		});
		expect(() =>
			service.respond(context, {
				runId,
				actionId: action.actionId,
				expectedRevision: action.revision,
				requestId: "stale-response",
				provenance: "user_explicit",
				responseSchema,
				payload: { choice: "preserve" },
			}),
		).toThrow("exact context is stale");
		expect(actions.get(runId, action.actionId)?.state).toBe("SUPERSEDED");
	});

	it("rejects responses that do not match the declared response schema", () => {
		const { service, action } = fixture();
		expect(() =>
			service.respond(context, {
				runId,
				actionId: action.actionId,
				expectedRevision: action.revision,
				requestId: "bad-response",
				provenance: "user_explicit",
				responseSchema,
				payload: { choice: "unknown" },
			}),
		).toThrow("invalid test response payload");
	});

	it("persists an unsolicited typed signal idempotently without interpreting its payload", () => {
		const { service, signals } = fixture();
		const input = {
			runId,
			expectedRunRevision: 1,
			requestId: "signal-1",
			provenance: "user_explicit" as const,
			signalType: "user_directive",
			payloadSchema: responseSchema,
			payload: { choice: "preserve" },
		};
		const first = service.signal(context, input);
		const replay = service.signal(context, input);
		expect(replay).toEqual(first);
		expect(signals.list(runId)).toHaveLength(1);
		expect(first.signalType).toBe("user_directive");
	});

	it("rejects stale workflow-revision signals before persistence", () => {
		const { service, signals } = fixture();
		expect(() =>
			service.signal(context, {
				runId,
				expectedRunRevision: 2,
				requestId: "signal-stale",
				provenance: "user_explicit",
				signalType: "user_directive",
				payloadSchema: responseSchema,
				payload: { choice: "preserve" },
			}),
		).toThrow("revision conflict");
		expect(signals.list(runId)).toHaveLength(0);
	});

	it("denies unauthorized callers from listing or resolving actions", () => {
		const { service, action } = fixture();
		const other: WorkflowAuthorizationContext = {
			principal: { kind: "session", id: "other-session" },
			ownerSessionId: "other-session",
		};
		expect(() => service.list(other, runId)).toThrow(WorkflowInteractionServiceError);
		expect(() =>
			service.respond(other, {
				runId,
				actionId: action.actionId,
				expectedRevision: action.revision,
				requestId: "unauthorized-response",
				provenance: "user_explicit",
				responseSchema,
				payload: { choice: "preserve" },
			}),
		).toThrow(WorkflowInteractionServiceError);
	});
});
