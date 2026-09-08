import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { type StartWorkflowInput, type WorkflowDecisionInput, type WorkflowJob } from "#internet/workflow/types";
export declare class WorkflowEngineError extends Error {
    constructor(message: string);
}
/**
 * Deterministic workflow state owner. Later TODOs attach TeamRunner, handoff,
 * writer, review, approval, and event controllers to this class.
 */
export declare class WorkflowEngine {
    private readonly jobs;
    constructor(jobs: WorkflowJobStore);
    start(input: StartWorkflowInput): WorkflowJob;
    status(jobId: string): WorkflowJob;
    cancel(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
    approve(input: WorkflowDecisionInput): WorkflowJob;
    reject(input: WorkflowDecisionInput): WorkflowJob;
}
//# sourceMappingURL=engine.d.ts.map