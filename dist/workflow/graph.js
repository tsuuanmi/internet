export const WORKFLOW_PHASES = ["RESEARCH", "WRITER", "REVIEW", "DONE"];
export const WORKFLOW_LIFECYCLES = ["RUNNING", "RECOVERING", "BLOCKED", "COMPLETED", "CANCELLED"];
export const WORKFLOW_NODE_KINDS = [
    "TEAM_MEMBER",
    "TEAM_SYNTHESIS",
    "RESEARCH_HANDOFF_GATE",
    "WRITER_IMPLEMENTATION",
    "REVIEW_HANDOFF_GATE",
    "WRITER_REMEDIATION",
];
export const WORKFLOW_NODE_STATES = [
    "WAITING",
    "READY",
    "RUNNING",
    "RECOVERING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
];
export const WORKFLOW_EXECUTION_STATES = [
    "QUEUED",
    "STARTING",
    "ACTIVE",
    "FENCED",
    "ORPHANED",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
];
export const WORKFLOW_PROVIDER_STATES = [
    "NAVIGATING",
    "THINKING",
    "STREAMING",
    "CONFIRMATION_REQUIRED",
    "STALLED",
    "RATE_LIMITED",
    "AUTH_REQUIRED",
    "BROWSER_DEAD",
    "COMPLETED",
];
export const WORKFLOW_FAILURE_CLASSES = [
    "PROVIDER",
    "TRANSPORT",
    "BROWSER",
    "AUTH",
    "OUTPUT",
    "AUTOMATION",
    "USER",
];
export const WORKFLOW_RETRY_DISPOSITIONS = [
    "IMMEDIATE",
    "BACKOFF",
    "RECREATE_SESSION",
    "USER_ACTION",
    "CODE_FIX",
    "NONE",
];
function positiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1)
        throw new Error(`${name} must be a positive integer`);
    return value;
}
export const workflowNodeId = {
    researchMember(lane, round, member) {
        return `research:${lane}:round:${positiveInteger(round, "round")}:member:${positiveInteger(member, "member")}`;
    },
    researchSynthesis(lane) {
        return `research:${lane}:synthesis`;
    },
    researchHandoffGate() {
        return "research:handoff-gate";
    },
    writerImplementation() {
        return "writer:implementation";
    },
    reviewMember(cycle, lane, round, member) {
        return `review:cycle:${positiveInteger(cycle, "cycle")}:${lane}:round:${positiveInteger(round, "round")}:member:${positiveInteger(member, "member")}`;
    },
    reviewSynthesis(cycle, lane) {
        return `review:cycle:${positiveInteger(cycle, "cycle")}:${lane}:synthesis`;
    },
    reviewHandoffGate(cycle) {
        return `review:cycle:${positiveInteger(cycle, "cycle")}:handoff-gate`;
    },
    writerRemediation(cycle) {
        return `writer:remediation:cycle:${positiveInteger(cycle, "cycle")}`;
    },
};
export function workflowNodeDependenciesCompleted(node, nodes) {
    return node.dependencies.every((dependencyId) => nodes[dependencyId]?.state === "COMPLETED");
}
export function workflowNodeInputMatchesDependencies(node, nodes) {
    if (!node.input)
        return false;
    return node.dependencies.every((dependencyId) => {
        const dependency = nodes[dependencyId];
        return (dependency?.state === "COMPLETED" &&
            dependency.output?.outputHash === node.input?.dependencyOutputHashes[dependencyId]);
    });
}
export function canReuseCompletedWorkflowNode(node, inputHash) {
    return node.state === "COMPLETED" && node.input?.inputHash === inputHash && node.output !== undefined;
}
export function assertWorkflowGraph(snapshot) {
    if (snapshot.graphRevision < 0 || !Number.isInteger(snapshot.graphRevision))
        throw new Error("workflow graphRevision must be a non-negative integer");
    if (snapshot.eventSeq < 0 || !Number.isInteger(snapshot.eventSeq))
        throw new Error("workflow eventSeq must be a non-negative integer");
    const executionIds = new Set();
    for (const [nodeId, node] of Object.entries(snapshot.nodes)) {
        if (node.nodeId !== nodeId)
            throw new Error(`workflow graph node key mismatch: ${nodeId}`);
        if (node.dependencies.includes(nodeId))
            throw new Error(`workflow graph node cannot depend on itself: ${nodeId}`);
        if (new Set(node.dependencies).size !== node.dependencies.length)
            throw new Error(`workflow graph node ${nodeId} has duplicate dependencies`);
        for (const dependencyId of node.dependencies)
            if (!snapshot.nodes[dependencyId])
                throw new Error(`workflow graph node ${nodeId} has unknown dependency ${dependencyId}`);
        if (["READY", "RUNNING", "RECOVERING", "COMPLETED", "FAILED"].includes(node.state) && !node.input)
            throw new Error(`workflow graph node ${nodeId} in ${node.state} requires an input receipt`);
        if (node.input)
            assertNodeInput(node);
        if (node.output) {
            if (!/^[0-9a-f]{64}$/u.test(node.output.resultId) || !/^[0-9a-f]{64}$/u.test(node.output.outputHash))
                throw new Error(`workflow graph node ${nodeId} has invalid output receipt`);
            if (!validTimestamp(node.output.completedAt))
                throw new Error(`workflow graph node ${nodeId} has invalid completion timestamp`);
        }
        if (node.state === "COMPLETED" && !node.output)
            throw new Error(`completed workflow graph node ${nodeId} requires an output receipt`);
        if (node.state === "WAITING" && node.dependencies.length === 0 && !node.waitReason)
            throw new Error(`waiting workflow graph node ${nodeId} requires a dependency or wait reason`);
        if (node.execution)
            assertExecution(nodeId, node.execution, executionIds);
        if (node.state === "RUNNING") {
            if (!node.execution || !["STARTING", "ACTIVE"].includes(node.execution.state))
                throw new Error(`running workflow graph node ${nodeId} requires a live execution`);
        }
        if (node.state === "RECOVERING" && (!node.failure || !node.recovery))
            throw new Error(`recovering workflow graph node ${nodeId} requires failure and recovery receipts`);
        if (node.state === "FAILED" && !node.failure)
            throw new Error(`failed workflow graph node ${nodeId} requires a failure receipt`);
    }
    assertAcyclic(snapshot.nodes);
}
function assertNodeInput(node) {
    const input = node.input;
    if (!input)
        return;
    if (!/^[0-9a-f]{64}$/u.test(input.inputHash))
        throw new Error(`workflow graph node ${node.nodeId} has invalid input hash`);
    const dependencyKeys = Object.keys(input.dependencyOutputHashes).sort();
    const dependencies = [...node.dependencies].sort();
    if (JSON.stringify(dependencyKeys) !== JSON.stringify(dependencies))
        throw new Error(`workflow graph node ${node.nodeId} input dependency receipt keys do not match dependencies`);
    for (const hash of Object.values(input.dependencyOutputHashes))
        if (!/^[0-9a-f]{64}$/u.test(hash))
            throw new Error(`workflow graph node ${node.nodeId} has invalid dependency output hash`);
}
function assertExecution(nodeId, execution, executionIds) {
    if (execution.executionId.trim() === "")
        throw new Error(`workflow graph node ${nodeId} has empty execution id`);
    if (executionIds.has(execution.executionId))
        throw new Error(`workflow graph execution id is duplicated: ${execution.executionId}`);
    executionIds.add(execution.executionId);
    positiveInteger(execution.attempt, "execution attempt");
    if (execution.ownerInstanceId.trim() === "")
        throw new Error(`workflow graph node ${nodeId} has empty execution owner`);
    for (const [name, value] of [
        ["startedAt", execution.startedAt],
        ["heartbeatAt", execution.heartbeatAt],
        ["leaseUntil", execution.leaseUntil],
        ["lastProviderEventAt", execution.lastProviderEventAt],
        ["lastMeaningfulProgressAt", execution.lastMeaningfulProgressAt],
    ]) {
        if (value !== undefined && !validTimestamp(value))
            throw new Error(`workflow graph node ${nodeId} has invalid execution ${name}`);
    }
}
function validTimestamp(value) {
    return Number.isFinite(Date.parse(value));
}
function assertAcyclic(nodes) {
    const visiting = new Set();
    const visited = new Set();
    const visit = (nodeId) => {
        if (visited.has(nodeId))
            return;
        if (visiting.has(nodeId))
            throw new Error(`workflow graph contains a dependency cycle at ${nodeId}`);
        visiting.add(nodeId);
        for (const dependencyId of nodes[nodeId]?.dependencies ?? [])
            visit(dependencyId);
        visiting.delete(nodeId);
        visited.add(nodeId);
    };
    for (const nodeId of Object.keys(nodes))
        visit(nodeId);
}
//# sourceMappingURL=graph.js.map