import { describe, expect, it } from "vitest";
import { buildTeamPlan, prepareTeamStep } from "#internet/team/plan";
import { workflowNodeId } from "#internet/workflow/graph";
import {
	buildInitialWorkflowGraph,
	createTeamStepInputReceipt,
	createWorkflowNodeInputReceipt,
	hashWorkflowGraphValue,
} from "#internet/workflow/graph-builder";
import { readyWorkflowNodeIds } from "#internet/workflow/graph-reducer";

const base = {
	repository: "https://github.com/example/repo",
	baseRevision: "0123456789abcdef0123456789abcdef01234567",
	rounds: 2,
	accounts: ["chatgpt-thinker", "chatgpt-thinker-2"] as const,
	synthesizer: "chatgpt-thinker" as const,
	research: {
		A: { task: "research focus A", sessionId: "owner:workflow:job:research:A" },
		B: { task: "research focus B", sessionId: "owner:workflow:job:research:B" },
	},
	writerSessionId: "owner:workflow:job:writer",
};

describe("workflow graph builder", () => {
	it("builds both research lanes concurrently from shared team dependencies", () => {
		const graph = buildInitialWorkflowGraph(base);
		expect(readyWorkflowNodeIds(graph)).toEqual([
			workflowNodeId.researchMember("A", 1, 1),
			workflowNodeId.researchMember("B", 1, 1),
		]);
		expect(graph.nodes[workflowNodeId.researchMember("A", 1, 2)]?.dependencies).toEqual([
			workflowNodeId.researchMember("A", 1, 1),
		]);
		expect(graph.nodes[workflowNodeId.researchSynthesis("A")]?.dependencies).toEqual([
			workflowNodeId.researchMember("A", 1, 1),
			workflowNodeId.researchMember("A", 1, 2),
			workflowNodeId.researchMember("A", 2, 1),
			workflowNodeId.researchMember("A", 2, 2),
		]);
	});

	it("binds root inputs to the exact prepared provider prompt", () => {
		const graph = buildInitialWorkflowGraph(base);
		const plan = buildTeamPlan({
			accounts: base.accounts,
			rounds: base.rounds,
			synthesize: true,
			synthesizer: base.synthesizer,
		});
		const step = plan.steps[0];
		if (step === undefined) throw new Error("missing first team step");
		const prepared = prepareTeamStep(plan, step, base.research.A.task, [], "workflow-research");
		const id = workflowNodeId.researchMember("A", 1, 1);
		expect(graph.nodes[id]?.input?.bindings?.promptHash).toBe(hashWorkflowGraphValue(prepared.prompt));
		expect(graph.nodes[id]?.input?.bindings?.promptStrategy).toBe("workflow-research");
	});

	it("creates exact downstream team receipts from dependency outputs and prepared prompt", () => {
		const plan = buildTeamPlan({
			accounts: base.accounts,
			rounds: 1,
			synthesize: true,
			synthesizer: base.synthesizer,
		});
		const step = plan.steps.at(-1);
		if (step === undefined) throw new Error("missing synthesis step");
		const transcript = [
			{ round: 1, accountId: "chatgpt-thinker" as const, provider: "chatgpt-web" as const, text: "A1" },
			{ round: 1, accountId: "chatgpt-thinker-2" as const, provider: "chatgpt-web" as const, text: "B1" },
		];
		const receipt = createTeamStepInputReceipt({
			nodeId: workflowNodeId.researchSynthesis("A"),
			plan,
			step,
			task: base.research.A.task,
			transcript,
			promptStrategy: "workflow-research",
			dependencyOutputHashes: {
				[workflowNodeId.researchMember("A", 1, 1)]: "a".repeat(64),
				[workflowNodeId.researchMember("A", 1, 2)]: "b".repeat(64),
			},
			bindings: { sessionId: base.research.A.sessionId },
		});
		expect(receipt.bindings?.promptHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(receipt.inputHash).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("blocks the writer behind both synthesis results and the research handoff gate", () => {
		const graph = buildInitialWorkflowGraph(base);
		const gate = graph.nodes[workflowNodeId.researchHandoffGate()];
		expect(gate?.dependencies).toEqual([
			workflowNodeId.researchSynthesis("A"),
			workflowNodeId.researchSynthesis("B"),
		]);
		expect(graph.nodes[workflowNodeId.writerImplementation()]?.dependencies).toEqual([
			workflowNodeId.researchHandoffGate(),
		]);
	});

	it("binds root-node identity to task/session/repository/base without storing task text", () => {
		const first = buildInitialWorkflowGraph(base);
		const changed = buildInitialWorkflowGraph({
			...base,
			research: { ...base.research, A: { ...base.research.A, task: "changed A" } },
		});
		const id = workflowNodeId.researchMember("A", 1, 1);
		expect(first.nodes[id]?.input?.inputHash).not.toBe(changed.nodes[id]?.input?.inputHash);
		expect(first.nodes[id]?.input?.bindings?.taskHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(JSON.stringify(first.nodes[id])).not.toContain("research focus A");
	});

	it("creates deterministic downstream input receipts independent of record insertion order", () => {
		const a = createWorkflowNodeInputReceipt("node", { b: "2", a: "1" }, { z: 1, a: "x" });
		const b = createWorkflowNodeInputReceipt("node", { a: "1", b: "2" }, { a: "x", z: 1 });
		expect(a).toEqual(b);
		expect(a.inputHash).toMatch(/^[0-9a-f]{64}$/u);
	});
});
