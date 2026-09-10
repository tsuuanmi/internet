import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowTeamTraceEvent, WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";
import { type WorkflowJob } from "#internet/workflow/types";
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
export declare function formatWorkflowStatus(job: WorkflowJob, trace: readonly WorkflowTeamTraceEvent[], active: boolean): string;
/** User-facing operations over authoritative durable workflow state. */
export declare class WorkflowOperator {
    private readonly engine;
    private readonly driver;
    private readonly jobs;
    private readonly traces;
    constructor(engine: WorkflowOperatorEngine, driver: WorkflowOperatorDriver, jobs: WorkflowJobStore, traces: WorkflowTeamTraceStore);
    list(ownerSessionId: string): string;
    status(ownerSessionId: string, jobId?: string): string;
    watch(ownerSessionId: string, jobId?: string): string;
    stop(ownerSessionId: string, jobId?: string): Promise<string>;
    continue(ownerSessionId: string, jobId?: string): string;
}
//# sourceMappingURL=operator.d.ts.map