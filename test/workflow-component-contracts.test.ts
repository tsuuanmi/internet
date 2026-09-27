import { describe, expect, it } from "vitest";
import { assertWorkflowComponentContractRef, WORKFLOW_COMPONENT_ERROR_CODES } from "#internet/workflow/components";

describe("workflow component contracts", () => {
	it("publishes one stable common error taxonomy", () => {
		expect(WORKFLOW_COMPONENT_ERROR_CODES).toEqual([
			"INVALID_INPUT",
			"UNSUPPORTED_VERSION",
			"NOT_FOUND",
			"CONFLICT",
			"STALE_BINDING",
			"NOT_AUTHORIZED",
			"DEPENDENCY_UNAVAILABLE",
			"TRANSIENT_FAILURE",
			"PERMANENT_FAILURE",
			"CANCELLED",
			"TIMEOUT",
			"UNCERTAIN_SIDE_EFFECT",
		]);
	});

	it("requires explicit non-empty contract identity and version", () => {
		expect(() => assertWorkflowComponentContractRef({ id: "graph-model", version: "1" })).not.toThrow();
		expect(() => assertWorkflowComponentContractRef({ id: "", version: "1" })).toThrow("contract id");
		expect(() => assertWorkflowComponentContractRef({ id: "graph-model", version: "" })).toThrow("contract version");
	});
});
