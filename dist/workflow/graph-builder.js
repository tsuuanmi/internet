import { createHash } from "node:crypto";
import { buildTeamPlan, prepareTeamStep } from "#internet/team/plan";
import { assertWorkflowGraph, workflowNodeId, } from "#internet/workflow/graph";
export function hashWorkflowGraphValue(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
export function createWorkflowNodeInputReceipt(nodeId, dependencyOutputHashes, bindings) {
    const normalizedDependencies = Object.entries(dependencyOutputHashes).sort(([a], [b]) => a.localeCompare(b));
    const normalizedBindings = Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b));
    const inputHash = hashWorkflowGraphValue(JSON.stringify([nodeId, normalizedDependencies, normalizedBindings]));
    return {
        inputHash,
        dependencyOutputHashes: Object.fromEntries(normalizedDependencies),
        bindings: Object.fromEntries(normalizedBindings),
    };
}
export function createTeamStepInputReceipt(input) {
    const prepared = prepareTeamStep(input.plan, input.step, input.task, input.transcript, input.promptStrategy);
    return createWorkflowNodeInputReceipt(input.nodeId, input.dependencyOutputHashes, {
        ...input.bindings,
        promptStrategy: input.promptStrategy,
        promptHash: hashWorkflowGraphValue(prepared.prompt),
    });
}
export function buildInitialWorkflowGraph(input) {
    const plan = buildTeamPlan({
        accounts: input.accounts,
        rounds: input.rounds,
        synthesize: true,
        synthesizer: input.synthesizer,
    });
    const nodes = {};
    for (const lane of ["A", "B"]) {
        const laneInput = input.research[lane];
        Object.assign(nodes, buildTeamNodes({
            plan,
            lane,
            phase: "RESEARCH",
            nodeIdForStep: (step) => researchStepNodeId(lane, step),
            rootDependencies: [],
            rootInput: laneInput,
            bindings: { repository: input.repository, baseRevision: input.baseRevision, lane },
            promptStrategy: "workflow-research",
        }));
    }
    const handoffGateId = workflowNodeId.researchHandoffGate();
    nodes[handoffGateId] = waitingNode(handoffGateId, "RESEARCH_HANDOFF_GATE", "RESEARCH", [
        workflowNodeId.researchSynthesis("A"),
        workflowNodeId.researchSynthesis("B"),
    ]);
    const writerId = workflowNodeId.writerImplementation();
    nodes[writerId] = waitingNode(writerId, "WRITER_IMPLEMENTATION", "WRITER", [handoffGateId]);
    const graph = {
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
export function buildReviewCycleNodes(input) {
    const plan = buildTeamPlan({
        accounts: input.accounts,
        rounds: input.rounds,
        synthesize: true,
        synthesizer: input.synthesizer,
    });
    const nodes = [];
    for (const lane of ["A", "B"]) {
        const byId = buildTeamNodes({
            plan,
            lane,
            phase: "REVIEW",
            nodeIdForStep: (step) => reviewStepNodeId(input.cycle, lane, step),
            rootDependencies: [input.sourceNodeId],
        });
        nodes.push(...Object.values(byId));
    }
    const gateId = workflowNodeId.reviewHandoffGate(input.cycle);
    nodes.push(waitingNode(gateId, "REVIEW_HANDOFF_GATE", "REVIEW", [
        workflowNodeId.reviewSynthesis(input.cycle, "A"),
        workflowNodeId.reviewSynthesis(input.cycle, "B"),
    ]));
    return nodes;
}
export function buildRemediationNode(cycle) {
    const nodeId = workflowNodeId.writerRemediation(cycle);
    return waitingNode(nodeId, "WRITER_REMEDIATION", "WRITER", [workflowNodeId.reviewHandoffGate(cycle)]);
}
export function buildHealthNode(cycle) {
    const nodeId = workflowNodeId.prHealth(cycle);
    return waitingNode(nodeId, "PR_HEALTH", "HEALTH", [workflowNodeId.reviewHandoffGate(cycle)]);
}
export function buildMergeAuthorizationNode(cycle) {
    const nodeId = workflowNodeId.mergeAuthorization(cycle);
    return waitingNode(nodeId, "MERGE_AUTHORIZATION", "MERGE", [workflowNodeId.prHealth(cycle)]);
}
export function buildMergeNode(cycle) {
    const nodeId = workflowNodeId.merge(cycle);
    return waitingNode(nodeId, "MERGE", "MERGE", [workflowNodeId.mergeAuthorization(cycle)]);
}
function buildTeamNodes(input) {
    const nodes = {};
    const nodeIdsByStepId = new Map(input.plan.steps.map((step) => [step.stepId, input.nodeIdForStep(step)]));
    for (const step of input.plan.steps) {
        const nodeId = nodeIdsByStepId.get(step.stepId);
        const planDependencies = step.dependsOnStepIds.map((stepId) => {
            const dependencyId = nodeIdsByStepId.get(stepId);
            if (dependencyId === undefined)
                throw new Error(`unknown team plan dependency ${stepId}`);
            return dependencyId;
        });
        const dependencies = planDependencies.length === 0 ? [...input.rootDependencies] : planDependencies;
        const ready = dependencies.length === 0 &&
            input.rootInput !== undefined &&
            input.bindings !== undefined &&
            input.promptStrategy !== undefined;
        nodes[nodeId] = {
            nodeId,
            kind: step.kind === "member" ? "TEAM_MEMBER" : "TEAM_SYNTHESIS",
            phase: input.phase,
            dependencies,
            state: ready ? "READY" : "WAITING",
            ...(ready
                ? {
                    input: createTeamStepInputReceipt({
                        nodeId,
                        plan: input.plan,
                        step,
                        task: input.rootInput.task,
                        transcript: [],
                        promptStrategy: input.promptStrategy,
                        dependencyOutputHashes: {},
                        bindings: {
                            ...input.bindings,
                            sessionId: input.rootInput.sessionId,
                            taskHash: hashWorkflowGraphValue(input.rootInput.task),
                            stepId: step.stepId,
                            accountId: step.accountId,
                        },
                    }),
                }
                : {}),
        };
    }
    return nodes;
}
function waitingNode(nodeId, kind, phase, dependencies) {
    return { nodeId, kind, phase, dependencies, state: "WAITING" };
}
function researchStepNodeId(lane, step) {
    return step.kind === "member"
        ? workflowNodeId.researchMember(lane, step.round, step.member)
        : workflowNodeId.researchSynthesis(lane);
}
function reviewStepNodeId(cycle, lane, step) {
    return step.kind === "member"
        ? workflowNodeId.reviewMember(cycle, lane, step.round, step.member)
        : workflowNodeId.reviewSynthesis(cycle, lane);
}
//# sourceMappingURL=graph-builder.js.map