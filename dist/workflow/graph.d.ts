export declare const WORKFLOW_PHASES: readonly ["RESEARCH", "WRITER", "REVIEW", "HEALTH", "MERGE", "DONE"];
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];
export declare const WORKFLOW_LIFECYCLES: readonly ["RUNNING", "WAITING_USER", "RECOVERING", "BLOCKED", "COMPLETED", "CANCELLED"];
export type WorkflowLifecycle = (typeof WORKFLOW_LIFECYCLES)[number];
export declare const WORKFLOW_NODE_KINDS: readonly ["TEAM_MEMBER", "TEAM_SYNTHESIS", "RESEARCH_HANDOFF_GATE", "WRITER_IMPLEMENTATION", "REVIEW_HANDOFF_GATE", "WRITER_REMEDIATION", "PR_HEALTH", "MERGE_AUTHORIZATION", "MERGE"];
export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number];
export declare const WORKFLOW_NODE_STATES: readonly ["WAITING", "READY", "RUNNING", "WAITING_USER", "RECOVERING", "COMPLETED", "FAILED", "CANCELLED"];
export type WorkflowNodeState = (typeof WORKFLOW_NODE_STATES)[number];
export declare const WORKFLOW_EXECUTION_STATES: readonly ["QUEUED", "STARTING", "ACTIVE", "FENCED", "ORPHANED", "SUCCEEDED", "FAILED", "CANCELLED"];
export type WorkflowExecutionState = (typeof WORKFLOW_EXECUTION_STATES)[number];
export declare const WORKFLOW_PROVIDER_STATES: readonly ["NAVIGATING", "THINKING", "STREAMING", "CONFIRMATION_REQUIRED", "WAITING_USER", "STALLED", "RATE_LIMITED", "AUTH_REQUIRED", "BROWSER_DEAD", "COMPLETED"];
export type WorkflowProviderState = (typeof WORKFLOW_PROVIDER_STATES)[number];
export declare const WORKFLOW_FAILURE_CLASSES: readonly ["PROVIDER", "TRANSPORT", "BROWSER", "AUTH", "OUTPUT", "AUTOMATION", "USER"];
export type WorkflowFailureClass = (typeof WORKFLOW_FAILURE_CLASSES)[number];
export declare const WORKFLOW_RETRY_DISPOSITIONS: readonly ["IMMEDIATE", "BACKOFF", "RECREATE_SESSION", "USER_ACTION", "CODE_FIX", "NONE"];
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
    readonly resultId: string;
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
    readonly kind: WorkflowNodeKind;
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
export declare const workflowNodeId: {
    readonly researchMember: (lane: WorkflowLane, round: number, member: number) => string;
    readonly researchSynthesis: (lane: WorkflowLane) => string;
    readonly researchHandoffGate: () => string;
    readonly writerImplementation: () => string;
    readonly reviewMember: (cycle: number, lane: WorkflowLane, round: number, member: number) => string;
    readonly reviewSynthesis: (cycle: number, lane: WorkflowLane) => string;
    readonly reviewHandoffGate: (cycle: number) => string;
    readonly writerRemediation: (cycle: number) => string;
    readonly prHealth: (cycle: number) => string;
    readonly mergeAuthorization: (cycle: number) => string;
    readonly merge: (cycle: number) => string;
};
export declare function workflowNodeDependenciesCompleted(node: WorkflowGraphNode, nodes: Readonly<Record<string, WorkflowGraphNode>>): boolean;
export declare function workflowNodeInputMatchesDependencies(node: WorkflowGraphNode, nodes: Readonly<Record<string, WorkflowGraphNode>>): boolean;
export declare function canReuseCompletedWorkflowNode(node: WorkflowGraphNode, inputHash: string): boolean;
export declare function assertWorkflowGraph(snapshot: WorkflowGraphSnapshot): void;
//# sourceMappingURL=graph.d.ts.map