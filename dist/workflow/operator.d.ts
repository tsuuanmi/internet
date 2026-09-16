import type { WorkflowEventJournal } from "#internet/workflow/events";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRetentionManager } from "#internet/workflow/retention";
import { WorkflowService, type WorkflowServiceDriver, type WorkflowServiceEngine } from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";
export type WorkflowOperatorEngine = WorkflowServiceEngine;
export type WorkflowOperatorDriver = WorkflowServiceDriver;
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
    private readonly service;
    private readonly events;
    constructor(service: WorkflowService, events: WorkflowEventJournal);
    constructor(engine: WorkflowOperatorEngine, driver: WorkflowOperatorDriver, jobs: WorkflowJobStore, events: WorkflowEventJournal, retention: WorkflowRetentionManager);
    list(ownerSessionId: string): string;
    status(ownerSessionId: string, jobId?: string): string;
    stop(ownerSessionId: string, jobId?: string): Promise<string>;
    delete(ownerSessionId: string, jobId?: string): Promise<string>;
    continue(ownerSessionId: string, jobId?: string): string;
}
//# sourceMappingURL=operator.d.ts.map