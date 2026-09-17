import { describe, expect, it } from "vitest";
import { type WorkflowCapabilityDescriptor, WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { routeWorkflowCapability } from "#internet/workflow/runtime/index";
import type { WorkflowNeedPayload } from "#internet/workflow/semantic/index";

const runId = "1".repeat(32);

function capability(id: string): WorkflowCapabilityDescriptor {
	return {
		id,
		version: "1",
		acceptedNeedTypes: ["execution"],
		producedArtifactTypes: [],
		producedReceiptTypes: [],
		sideEffect: "READ_ONLY",
		requiredAuthority: [],
		executorKinds: ["test"],
		inputSchema: { id: `${id}-input`, version: "1" },
		outputSchema: { id: `${id}-output`, version: "1" },
		policyHooks: [],
	};
}

function run(capabilities: readonly WorkflowCapabilityDescriptor[]): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId,
		admissionId: "2".repeat(32),
		owner: { kind: "service", id: "workflow-service" },
		lifecycle: "ACTIVE",
		definitions: {
			profile: { id: "test", version: "1" },
			policy: { id: "test", version: "1" },
			capabilities: capabilities.map(({ id, version }) => ({ id, version })),
			schemas: [],
			projection: { id: "test", version: "1" },
		},
		createdAt: "2026-09-17T10:00:00.000Z",
		updatedAt: "2026-09-17T10:00:00.000Z",
	};
}

function need(requestedCapability?: string): WorkflowNeedPayload {
	return {
		needId: "need-1",
		type: "execution",
		requestOwner: { kind: "workflow_run", id: runId },
		question: "Implement the task",
		subjects: [],
		relatedArtifacts: [],
		requestedCapability,
	};
}

describe("workflow vNext capability routing", () => {
	it("routes only to an explicitly pinned requested capability", () => {
		const research = capability("research");
		const implementation = capability("implementation");
		const registry = new WorkflowCapabilityRegistry([research, implementation]);
		expect(routeWorkflowCapability(run([research, implementation]), need("implementation"), registry).id).toBe(
			"implementation",
		);
	});

	it("rejects ambiguous routing instead of interpreting Need prose", () => {
		const research = capability("research");
		const implementation = capability("implementation");
		const registry = new WorkflowCapabilityRegistry([research, implementation]);
		expect(() => routeWorkflowCapability(run([research, implementation]), need(), registry)).toThrow(
			"maps to multiple pinned workflow capabilities",
		);
	});
});
