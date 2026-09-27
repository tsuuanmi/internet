import type { WorkflowGraphValidator } from "#internet/workflow/graph-validator";
import { type WorkflowJob } from "#internet/workflow/types";
export declare class WorkflowJobStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowJobStore {
    private readonly graphValidator;
    private readonly jobsDir;
    constructor(dataDir: string, graphValidator: WorkflowGraphValidator);
    pathFor(jobId: string): string;
    create(job: WorkflowJob): WorkflowJob;
    get(jobId: string): WorkflowJob | undefined;
    list(): readonly WorkflowJob[];
    update(jobId: string, expectedRevision: number, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob;
    private read;
}
export declare function parseWorkflowJob(value: unknown, graphValidator: WorkflowGraphValidator): WorkflowJob;
//# sourceMappingURL=job-store.d.ts.map