import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowVersionRef } from "#internet/workflow/kernel/types";
import type { WorkflowAwaitableRuntime, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
export type WorkflowResearchRoundWait = {
    readonly kind: "timer";
    readonly delayMs: number;
} | {
    readonly kind: "external_event";
    readonly eventType: string;
    readonly payloadSchema?: WorkflowVersionRef;
};
export interface WorkflowResearchPolicyOptions {
    readonly maxRounds?: number;
    readonly roundWait?: WorkflowResearchRoundWait;
}
export declare function createWorkflowResearchPolicy(artifacts: WorkflowArtifactStore, inputBundles: WorkflowInputBundleStore, awaitables: WorkflowAwaitableRuntime, options?: WorkflowResearchPolicyOptions): WorkflowRuntimePolicy;
//# sourceMappingURL=policy.d.ts.map