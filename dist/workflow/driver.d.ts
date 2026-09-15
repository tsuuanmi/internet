import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob } from "#internet/workflow/types";
export interface WorkflowDriverEngine {
    status(jobId: string): WorkflowJob;
    reconcile(jobId: string, ownerInstanceId: string, at?: number): WorkflowJob;
    advance(jobId: string): WorkflowJob;
    runnableNodeIds(jobId: string, at?: number): readonly string[];
    nextRecoveryAt(jobId: string): string | undefined;
    executeNode(jobId: string, nodeId: string, ownerInstanceId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    blockSchedulerFailure(jobId: string, error: unknown): WorkflowJob;
    cancel(jobId: string): WorkflowJob;
}
/** Background owner for one durable graph scheduler. Semantic readiness remains in WorkflowEngine. */
export declare class WorkflowDriver {
    private readonly engine;
    private readonly jobs;
    private readonly active;
    private disposed;
    constructor(engine: WorkflowDriverEngine, jobs: WorkflowJobStore);
    isActive(jobId: string): boolean;
    enqueue(jobId: string): void;
    resumeActive(): void;
    cancel(jobId: string): Promise<WorkflowJob>;
    dispose(): Promise<void>;
    private drive;
}
//# sourceMappingURL=driver.d.ts.map