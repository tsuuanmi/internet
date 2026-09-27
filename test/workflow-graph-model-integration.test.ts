import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	TypeScriptWorkflowGraphModel,
	type WorkflowDependencyGraphV1,
	type WorkflowGraphAnalysisV1,
	type WorkflowGraphModelPort,
} from "#internet/workflow/components";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const baseRevision = "0123456789abcdef0123456789abcdef01234567";

class CountingGraphModel implements WorkflowGraphModelPort {
	calls = 0;
	private readonly delegate = new TypeScriptWorkflowGraphModel();

	analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1 {
		this.calls += 1;
		return this.delegate.analyze(graph);
	}
}

class RejectingGraphModel implements WorkflowGraphModelPort {
	calls = 0;

	analyze(graph: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1 {
		this.calls += 1;
		throw new Error(`sentinel graph model: ${graph.graphId}@${graph.revision}`);
	}
}

describe("workflow graph model production boundary", () => {
	it("keeps graph algorithms at topology and durable-read boundaries", () => {
		const graphModel = new CountingGraphModel();
		const runtime = createWorkflowTestRuntime(
			mkdtempSync(join(tmpdir(), "internet-workflow-graph-model-counting-")),
			{ graphModel },
		);
		const job = runtime.engine.start({
			ownerSessionId: "agent",
			objective: "Keep state-only persistence independent from graph algorithms.",
			repository: "https://github.com/example/repo",
			baseRevision,
		});

		expect(graphModel.calls).toBe(1);
		runtime.jobs.update(job.jobId, job.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: new Date().toISOString(),
		}));
		expect(graphModel.calls).toBe(1);

		graphModel.calls = 0;
		expect(runtime.jobs.get(job.jobId)?.jobId).toBe(job.jobId);
		expect(graphModel.calls).toBe(1);
	});

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
