import type { WorkflowEventJournal } from "#internet/workflow/events";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRetentionManager } from "#internet/workflow/retention";
import type { WorkflowJob } from "#internet/workflow/types";
export interface WorkflowOperatorEngine {
    status(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
}
export interface WorkflowOperatorDriver {
    enqueue(jobId: string): void;
    cancel(jobId: string): Promise<WorkflowJob>;
    isActive(jobId: string): boolean;
}
export declare class WorkflowOperatorError extends Error {
    constructor(message: string);
}
export declare function formatWorkflowList(jobs: readonly WorkflowJob[]): string;
export declare function formatWorkflowStatus(job: WorkflowJob, events: readonly {
    readonly eventSeq: number;
    readonly at: string;
    readonly type: string;
    readonly nodeId?: string;
}[], driverActive: boolean): string;
export declare class WorkflowOperator {
    private readonly engine;
    private readonly driver;
    private readonly jobs;
    private readonly events;
    private readonly retention;
    constructor(engine: WorkflowOperatorEngine, driver: WorkflowOperatorDriver, jobs: WorkflowJobStore, events: WorkflowEventJournal, retention: WorkflowRetentionManager);
    list(ownerSessionId: string): string;
    status(ownerSessionId: string, jobId?: string): string;
    stop(ownerSessionId: string, jobId?: string): Promise<string>;
    delete(ownerSessionId: string, jobId?: string): Promise<string>;
    continue(ownerSessionId: string, jobId?: string): string;
}
//# sourceMappingURL=operator.d.ts.map