import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	WorkflowDependencyGraphV1,
	WorkflowGraphAnalysisV1,
	WorkflowGraphModelPort,
} from "#internet/workflow/components";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const baseRevision = "0123456789abcdef0123456789abcdef01234567";

class RejectingGraphModel implements WorkflowGraphModelPort {
	calls = 0;

	analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1 {
		this.calls += 1;
		throw new Error(`sentinel graph model: ${graph.graphId}@${graph.revision}`);
	}
}

describe("workflow graph model production boundary", () => {
	it("uses the injected graph model before an initial graph becomes durable", () => {
		const graphModel = new RejectingGraphModel();
		const runtime = createWorkflowTestRuntime(
			mkdtempSync(join(tmpdir(), "internet-workflow-graph-model-integration-")),
			{ graphModel },
		);

		expect(() =>
			runtime.engine.start({
				ownerSessionId: "agent",
				objective: "Validate the graph through the configured port.",
				repository: "https://github.com/example/repo",
				baseRevision,
			}),
		).toThrow("sentinel graph model");
		expect(graphModel.calls).toBe(1);
	});
});
