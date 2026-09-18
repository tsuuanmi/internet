import { describe, expect, it } from "vitest";
import {
	evaluateWorkflowConvergence,
	promoteWorkflowSemanticResult,
	WORKFLOW_ASSESSMENT_VERDICTS,
	WORKFLOW_PLANNING_CAPABILITY,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
} from "#internet/index";

describe("workflow semantic public API", () => {
	it("publishes the Phase 3 semantic, planning, promotion, and convergence contracts", () => {
		expect(WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective).toBe("objective");
		expect(WORKFLOW_ASSESSMENT_VERDICTS).toEqual(["SATISFIED", "UNSATISFIED", "INCONCLUSIVE"]);
		expect(WORKFLOW_PLANNING_CAPABILITY.id).toBe("planning");
		expect(promoteWorkflowSemanticResult).toBeTypeOf("function");
		expect(evaluateWorkflowConvergence).toBeTypeOf("function");
	});
});
