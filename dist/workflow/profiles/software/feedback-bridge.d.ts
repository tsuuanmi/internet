import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowExternalSignal, WorkflowPendingAction } from "#internet/workflow/interactions/types";
export interface WorkflowSoftwareFeedbackBridgeDependencies {
    readonly artifacts: WorkflowArtifactStore;
    readonly inputBundles: WorkflowInputBundleStore;
}
export declare class WorkflowSoftwareFeedbackBridge {
    private readonly dependencies;
    constructor(dependencies: WorkflowSoftwareFeedbackBridgeDependencies);
    onResolved(action: WorkflowPendingAction): void;
    onSignal(signal: WorkflowExternalSignal): void;
    private boundDelivery;
    private persistFeedback;
}
//# sourceMappingURL=feedback-bridge.d.ts.map