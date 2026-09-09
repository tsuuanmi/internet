import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { type WorkflowJob, type WorkflowState } from "#internet/workflow/types";
export interface WorkflowDriverEngine {
    status(jobId: string): WorkflowJob;
    runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    runWriterImplementation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    runReview(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    runWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    requestMergeAuthorization(jobId: string): WorkflowJob;
    runWriterMerge(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    markRetryRequired(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob;
    cancel(jobId: string): WorkflowJob;
}
/** Deterministic background driver over WorkflowEngine primitives. It never decides implementation content. */
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