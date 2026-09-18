import type { WorkflowInteractionService } from "#internet/workflow/interactions/service";
import type { WorkflowPendingActionContract } from "#internet/workflow/interactions/types";
import type { WorkflowPendingActionStore } from "#internet/workflow/pending-action-store";
import type { WorkflowPendingActionRuntime } from "#internet/workflow/runtime/types";
export declare class WorkflowDurablePendingActionRuntime implements WorkflowPendingActionRuntime {
    private readonly store;
    private readonly service;
    constructor(store: WorkflowPendingActionStore, service: WorkflowInteractionService);
    ensure(input: {
        readonly run: Parameters<WorkflowPendingActionStore["ensure"]>[0]["run"];
        readonly needArtifact: Parameters<WorkflowPendingActionStore["ensure"]>[0]["needArtifact"];
        readonly need: Parameters<WorkflowPendingActionStore["ensure"]>[0]["need"];
        readonly contract: WorkflowPendingActionContract;
        readonly now?: () => number;
    }): import("#internet/workflow/interactions/types").WorkflowPendingAction;
    list(runId: string): readonly import("#internet/workflow/interactions/types").WorkflowPendingAction[];
    hasOpen(runId: string, needArtifactId: string): boolean;
    reconcile(runId: string): void;
}
//# sourceMappingURL=runtime.d.ts.map