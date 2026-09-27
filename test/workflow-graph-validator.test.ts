import { describe, expect, it } from "vitest";
import type {
	WorkflowDependencyGraphV1,
	WorkflowGraphAnalysisV1,
	WorkflowGraphModelPort,
} from "#internet/workflow/components";
import type { WorkflowGraphSnapshot } from "#internet/workflow/graph";
import { WorkflowGraphValidator } from "#internet/workflow/graph-validator";

function graph(): WorkflowGraphSnapshot {
	return {
		schema: "@tsuuanmi/internet-workflow-graph",
		version: 1,
		graphRevision: 4,
		eventSeq: 0,
		phase: "RESEARCH",
		lifecycle: "RUNNING",
		nodes: {
			root: {
				nodeId: "root",
				kind: "TEAM_MEMBER",
				phase: "RESEARCH",
				dependencies: [],
				state: "WAITING",
				waitReason: "fixture",
			},
		},
	};
}

class InvalidResultGraphModel implements WorkflowGraphModelPort {
	private readonly mutate: (result: WorkflowGraphAnalysisV1) => WorkflowGraphAnalysisV1;

	constructor(mutate: (result: WorkflowGraphAnalysisV1) => WorkflowGraphAnalysisV1) {
		this.mutate = mutate;
	}

	analyze(input: WorkflowDependencyGraphV1): WorkflowGraphAnalysisV1 {
		return this.mutate({
			schema: "@tsuuanmi/internet-workflow-graph-analysis",
			version: 1,
			graphId: input.graphId,
			revision: input.revision,
			acyclic: true,
			topologicalOrder: ["root"],
			topologicalLayers: [["root"]],
			readyNodes: ["root"],
			cycles: [],
		});
	}
}

describe("WorkflowGraphValidator", () => {
	it("rejects an adapter result with an unsupported schema or version", () => {
		const validator = new WorkflowGraphValidator(
			new InvalidResultGraphModel(
				(result) =>
					({
						...result,
						schema: "@example/wrong-graph-analysis",
						version: 2,
					}) as unknown as WorkflowGraphAnalysisV1,
			),
		);

		expect(() => validator.assert("job-1", graph())).toThrow("unsupported workflow graph analysis schema");
	});

	it("rejects an adapter result bound to a different graph identity", () => {
		const validator = new WorkflowGraphValidator(
			new InvalidResultGraphModel((result) => ({ ...result, graphId: "other-job" })),
		);

		expect(() => validator.assert("job-1", graph())).toThrow("mismatched graph identity");
	});
});
