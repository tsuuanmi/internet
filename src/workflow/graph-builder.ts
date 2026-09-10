import { createHash } from "node:crypto";
import type { AccountId } from "#internet/core/accounts";
import { buildTeamPlan, type TeamPlanStep } from "#internet/team/plan";
import {
	assertWorkflowGraph,
	type WorkflowGraphNode,
	type WorkflowGraphSnapshot,
	type WorkflowLane,
	type WorkflowNodeInputReceipt,
	workflowNodeId,
} from "#internet/workflow/graph";

export interface WorkflowResearchLaneInput {
	readonly task: string;
	readonly sessionId: string;
}

export interface InitialWorkflowGraphInput {
	readonly repository: string;
	readonly baseRevision: string;
	readonly rounds: number;
	readonly accounts: readonly AccountId[];
	readonly synthesizer: AccountId;
	readonly research: Readonly<Record<WorkflowLane, WorkflowResearchLaneInput>>;
	readonly writerSessionId: string;
}

export function hashWorkflowGraphValue(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createWorkflowNodeInputReceipt(
	nodeId: string,
	dependencyOutputHashes: Readonly<Record<string, string>>,
	bindings: Readonly<Record<string, string | number | boolean>>,
): WorkflowNodeInputReceipt {
	const normalizedDependencies = Object.entries(dependencyOutputHashes).sort(([a], [b]) => a.localeCompare(b));
	const normalizedBindings = Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b));
	const inputHash = hashWorkflowGraphValue(JSON.stringify([nodeId, normalizedDependencies, normalizedBindings]));
	return {
		inputHash,
		dependencyOutputHashes: Object.fromEntries(normalizedDependencies),
		bindings: Object.fromEntries(normalizedBindings),
	};
}

export function buildInitialWorkflowGraph(input: InitialWorkflowGraphInput): WorkflowGraphSnapshot {
	const plan = buildTeamPlan({
		accounts: input.accounts,
		rounds: input.rounds,
		synthesize: true,
		synthesizer: input.synthesizer,
	});
	const nodes: Record<string, WorkflowGraphNode> = {};

	for (const lane of ["A", "B"] as const) {
		const laneInput = input.research[lane];
		const nodeIdsByStepId = new Map<string, string>();
		for (const step of plan.steps) {
			const nodeId = researchStepNodeId(lane, step);
			nodeIdsByStepId.set(step.stepId, nodeId);
			const dependencies = step.dependsOnStepIds.map((stepId) => {
				const dependencyId = nodeIdsByStepId.get(stepId);
				if (dependencyId === undefined) throw new Error(`team plan dependency ${stepId} must precede ${step.stepId}`);
				return dependencyId;
			});
			const bindings = stepBindings(input, lane, laneInput, step);
			const ready = dependencies.length === 0;
			nodes[nodeId] = {
				nodeId,
				kind: step.kind === "member" ? "TEAM_MEMBER" : "TEAM_SYNTHESIS",
				phase: "RESEARCH",
				dependencies,
				state: ready ? "READY" : "WAITING",
				...(ready ? { input: createWorkflowNodeInputReceipt(nodeId, {}, bindings) } : {}),
			};
		}
	}

	const handoffGateId = workflowNodeId.researchHandoffGate();
	nodes[handoffGateId] = {
		nodeId: handoffGateId,
		kind: "RESEARCH_HANDOFF_GATE",
		phase: "RESEARCH",
		dependencies: [workflowNodeId.researchSynthesis("A"), workflowNodeId.researchSynthesis("B")],
		state: "WAITING",
	};

	const writerId = workflowNodeId.writerImplementation();
	nodes[writerId] = {
		nodeId: writerId,
		kind: "WRITER_IMPLEMENTATION",
		phase: "WRITER",
		dependencies: [handoffGateId],
		state: "WAITING",
	};

	const graph: WorkflowGraphSnapshot = {
		schema: "@tsuuanmi/internet-workflow-graph",
		version: 1,
		graphRevision: 0,
		eventSeq: 0,
		phase: "RESEARCH",
		lifecycle: "RUNNING",
		nodes,
	};
	assertWorkflowGraph(graph);
	return graph;
}

function researchStepNodeId(lane: WorkflowLane, step: TeamPlanStep): string {
	return step.kind === "member"
		? workflowNodeId.researchMember(lane, step.round, step.member)
		: workflowNodeId.researchSynthesis(lane);
}

function stepBindings(
	input: InitialWorkflowGraphInput,
	lane: WorkflowLane,
	laneInput: WorkflowResearchLaneInput,
	step: TeamPlanStep,
): Readonly<Record<string, string | number | boolean>> {
	return {
		repository: input.repository,
		baseRevision: input.baseRevision,
		lane,
		sessionId: laneInput.sessionId,
		taskHash: hashWorkflowGraphValue(laneInput.task),
		stepId: step.stepId,
		accountId: step.accountId,
	};
}
