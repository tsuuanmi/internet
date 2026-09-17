import { describe, expect, it } from "vitest";
import {
	WorkflowCapabilityRegistry,
	WorkflowCapabilityRegistryError,
	type WorkflowCapabilityDescriptor,
} from "#internet/workflow/capability-registry";

function descriptor(version = "1"): WorkflowCapabilityDescriptor {
	return {
		id: "repository_research",
		version,
		acceptedNeedTypes: ["repository_evidence"],
		producedArtifactTypes: ["evidence"],
		producedReceiptTypes: [],
		sideEffect: "READ_ONLY",
		requiredAuthority: [],
		executorKinds: ["team_reasoning"],
		inputSchema: { id: "repository-research-input", version: "1" },
		outputSchema: { id: "repository-research-output", version: "1" },
		policyHooks: [],
	};
}

describe("workflow capability registry", () => {
	it("resolves capabilities by exact semantic id and version", () => {
		const v1 = descriptor("1");
		const v2 = descriptor("2");
		const registry = new WorkflowCapabilityRegistry([v2, v1]);
		expect(registry.resolve({ id: "repository_research", version: "1" })).toBe(v1);
		expect(registry.resolve({ id: "repository_research", version: "2" })).toBe(v2);
		expect(registry.list()).toEqual([v1, v2]);
	});

	it("rejects duplicate exact versions without conflating provider topology", () => {
		expect(() => new WorkflowCapabilityRegistry([descriptor(), descriptor()])).toThrow(
			WorkflowCapabilityRegistryError,
		);
	});

	it("fails closed for an unregistered version", () => {
		const registry = new WorkflowCapabilityRegistry([descriptor()]);
		expect(() => registry.resolve({ id: "repository_research", version: "2" })).toThrow("is not registered");
	});
});
