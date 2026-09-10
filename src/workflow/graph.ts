export const WORKFLOW_PHASES = ["RESEARCH", "WRITER", "REVIEW", "PR_HEALTH", "MERGE", "DONE"] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const WORKFLOW_LIFECYCLES = [
	"RUNNING",
	"WAITING_USER",
	"RECOVERING",
	"BLOCKED",
	"COMPLETED",
	"CANCELLED",
] as const;
export type WorkflowLifecycle = (typeof WORKFLOW_LIFECYCLES)[number];

export const WORKFLOW_NODE_STATES = [
	"WAITING",
	"READY",
	"RUNNING",
	"WAITING_USER",
	"RECOVERING",
	"COMPLETED",
	"FAILED",
	"CANCELLED",
] as const;
export type WorkflowNodeState = (typeof WORKFLOW_NODE_STATES)[number];

export const WORKFLOW_EXECUTION_STATES = [
	"QUEUED",
	"STARTING",
	"ACTIVE",
	"FENCED",
	"ORPHANED",
	"SUCCEEDED",
	"FAILED",
	"CANCELLED",
] as const;
export type WorkflowExecutionState = (typeof WORKFLOW_EXECUTION_STATES)[number];

export const WORKFLOW_PROVIDER_STATES = [
	"NAVIGATING",
	"THINKING",
	"STREAMING",
	"CONFIRMATION_REQUIRED",
	"WAITING_USER",
	"STALLED",
	"RATE_LIMITED",
	"AUTH_REQUIRED",
	"BROWSER_DEAD",
	"COMPLETED",
] as const;
export type WorkflowProviderState = (typeof WORKFLOW_PROVIDER_STATES)[number];

export const WORKFLOW_FAILURE_CLASSES = [
	"PROVIDER",
	"TRANSPORT",
	"BROWSER",
	"AUTH",
	"OUTPUT",
	"AUTOMATION",
	"USER",
] as const;
export type WorkflowFailureClass = (typeof WORKFLOW_FAILURE_CLASSES)[number];

export const WORKFLOW_RETRY_DISPOSITIONS = [
	"IMMEDIATE",
	"BACKOFF",
	"RECREATE_SESSION",
	"USER_ACTION",
	"CODE_FIX",
	"NONE",
] as const;
export type WorkflowRetryDisposition = (typeof WORKFLOW_RETRY_DISPOSITIONS)[number];

export interface WorkflowFailure {
	readonly class: WorkflowFailureClass;
	readonly code: string;
	readonly message: string;
	readonly retry: WorkflowRetryDisposition;
	readonly at: string;
}

export interface WorkflowNodeInputReceipt {
	readonly inputHash: string;
	readonly dependencyOutputHashes: Readonly<Record<string, string>>;
	readonly bindings?: Readonly<Record<string, string | number | boolean>>;
}

export interface WorkflowNodeOutputReceipt {
	readonly outputHash: string;
	readonly completedAt: string;
}

export interface WorkflowExecutionRecord {
	readonly executionId: string;
	readonly attempt: number;
	readonly state: WorkflowExecutionState;
	readonly ownerInstanceId: string;
	readonly startedAt: string;
	readonly heartbeatAt: string;
	readonly leaseUntil: string;
	readonly providerState?: WorkflowProviderState;
	readonly lastProviderEventAt?: string;
	readonly lastMeaningfulProgressAt?: string;
}

export interface WorkflowRecoveryPlan {
	readonly action: "RETRY" | "BACKOFF" | "RECREATE_SESSION" | "RECONCILE" | "USER_ACTION" | "CODE_FIX";
	readonly attempt: number;
	readonly maxAttempts: number;
	readonly notBefore?: string;
}

export interface WorkflowGraphNode {
	readonly nodeId: string;
	readonly phase: WorkflowPhase;
	readonly dependencies: readonly string[];
	readonly state: WorkflowNodeState;
	readonly input?: WorkflowNodeInputReceipt;
	readonly output?: WorkflowNodeOutputReceipt;
	readonly execution?: WorkflowExecutionRecord;
	readonly waitReason?: string;
	readonly failure?: WorkflowFailure;
	readonly recovery?: WorkflowRecoveryPlan;
}

export interface WorkflowGraphSnapshot {
	readonly schema: "@tsuuanmi/internet-workflow-graph";
	readonly version: 1;
	readonly graphRevision: number;
	readonly eventSeq: number;
	readonly phase: WorkflowPhase;
	readonly lifecycle: WorkflowLifecycle;
	readonly nodes: Readonly<Record<string, WorkflowGraphNode>>;
}

export type WorkflowLane = "A" | "B";

function positiveInteger(value: number, name: string): number {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

export const workflowNodeId = {
	researchMember(lane: WorkflowLane, round: number, member: number): string {
		return `research:${lane}:round:${positiveInteger(round, "round")}:member:${positiveInteger(member, "member")}`;
	},
	researchSynthesis(lane: WorkflowLane): string {
		return `research:${lane}:synthesis`;
	},
	writerImplementation(): string {
		return "writer:implementation";
	},
	reviewMember(cycle: number, lane: WorkflowLane, round: number, member: number): string {
		return `review:cycle:${positiveInteger(cycle, "cycle")}:${lane}:round:${positiveInteger(round, "round")}:member:${positiveInteger(member, "member")}`;
	},
	reviewSynthesis(cycle: number, lane: WorkflowLane): string {
		return `review:cycle:${positiveInteger(cycle, "cycle")}:${lane}:synthesis`;
	},
	writerRemediation(cycle: number): string {
		return `writer:remediation:cycle:${positiveInteger(cycle, "cycle")}`;
	},
	prHealth(cycle: number): string {
		return `pr-health:cycle:${positiveInteger(cycle, "cycle")}`;
	},
	merge(cycle: number): string {
		return `merge:cycle:${positiveInteger(cycle, "cycle")}`;
	},
} as const;

export function workflowNodeDependenciesCompleted(
	node: WorkflowGraphNode,
	nodes: Readonly<Record<string, WorkflowGraphNode>>,
): boolean {
	return node.dependencies.every((dependencyId) => nodes[dependencyId]?.state === "COMPLETED");
}

export function workflowNodeInputMatchesDependencies(
	node: WorkflowGraphNode,
	nodes: Readonly<Record<string, WorkflowGraphNode>>,
): boolean {
	if (!node.input) return false;
	return node.dependencies.every((dependencyId) => {
		const dependency = nodes[dependencyId];
		return dependency?.state === "COMPLETED" && dependency.output?.outputHash === node.input?.dependencyOutputHashes[dependencyId];
	});
}

export function canReuseCompletedWorkflowNode(node: WorkflowGraphNode, inputHash: string): boolean {
	return node.state === "COMPLETED" && node.input?.inputHash === inputHash && node.output !== undefined;
}

export function assertWorkflowGraph(snapshot: WorkflowGraphSnapshot): void {
	if (snapshot.graphRevision < 0 || !Number.isInteger(snapshot.graphRevision)) {
		throw new Error("workflow graphRevision must be a non-negative integer");
	}
	if (snapshot.eventSeq < 0 || !Number.isInteger(snapshot.eventSeq)) {
		throw new Error("workflow eventSeq must be a non-negative integer");
	}

	for (const [nodeId, node] of Object.entries(snapshot.nodes)) {
		if (node.nodeId !== nodeId) throw new Error(`workflow graph node key mismatch: ${nodeId}`);
		if (node.dependencies.includes(nodeId)) throw new Error(`workflow graph node cannot depend on itself: ${nodeId}`);
		for (const dependencyId of node.dependencies) {
			if (!snapshot.nodes[dependencyId]) {
				throw new Error(`workflow graph node ${nodeId} has unknown dependency ${dependencyId}`);
			}
		}

		if (["READY", "RUNNING", "WAITING_USER", "RECOVERING", "COMPLETED", "FAILED"].includes(node.state) && !node.input) {
			throw new Error(`workflow graph node ${nodeId} in ${node.state} requires an input receipt`);
		}
		if (node.state === "COMPLETED" && !node.output) {
			throw new Error(`completed workflow graph node ${nodeId} requires an output receipt`);
		}
		if (node.state === "WAITING" && node.dependencies.length === 0 && !node.waitReason) {
			throw new Error(`waiting workflow graph node ${nodeId} requires a dependency or wait reason`);
		}
		if (node.state === "RUNNING" || node.state === "WAITING_USER") {
			if (!node.execution || !["STARTING", "ACTIVE"].includes(node.execution.state)) {
				throw new Error(`${node.state.toLowerCase()} workflow graph node ${nodeId} requires a live execution`);
			}
		}
		if (node.state === "RECOVERING" && (!node.failure || !node.recovery)) {
			throw new Error(`recovering workflow graph node ${nodeId} requires failure and recovery receipts`);
		}
		if (node.state === "FAILED" && !node.failure) {
			throw new Error(`failed workflow graph node ${nodeId} requires a failure receipt`);
		}
	}

	assertAcyclic(snapshot.nodes);
}

function assertAcyclic(nodes: Readonly<Record<string, WorkflowGraphNode>>): void {
	const visiting = new Set<string>();
	const visited = new Set<string>();

	const visit = (nodeId: string): void => {
		if (visited.has(nodeId)) return;
		if (visiting.has(nodeId)) throw new Error(`workflow graph contains a dependency cycle at ${nodeId}`);
		visiting.add(nodeId);
		for (const dependencyId of nodes[nodeId]?.dependencies ?? []) visit(dependencyId);
		visiting.delete(nodeId);
		visited.add(nodeId);
	};

	for (const nodeId of Object.keys(nodes)) visit(nodeId);
}
