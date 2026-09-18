import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowRunCoordinator } from "#internet/workflow/runtime/coordinator";
export declare class WorkflowRunDriver {
    private readonly active;
    private readonly coordinator;
    private readonly runs;
    private disposed;
    constructor(coordinator: WorkflowRunCoordinator, runs: WorkflowRunStore);
    isActive(runId: string): boolean;
    enqueue(runId: string): void;
    resumeActive(): void;
    cancel(runId: string): Promise<WorkflowRun>;
    dispose(): Promise<void>;
    private drive;
}
//# sourceMappingURL=driver.d.ts.map