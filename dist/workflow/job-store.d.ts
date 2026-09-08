import { type WorkflowJob } from "#internet/workflow/types";
export declare class WorkflowJobStoreError extends Error {
    constructor(message: string);
}
/** Durable per-job JSON storage. One job is one private atomic file. */
export declare class WorkflowJobStore {
    private readonly jobsDir;
    constructor(dataDir: string);
    pathFor(jobId: string): string;
    create(job: WorkflowJob): WorkflowJob;
    get(jobId: string): WorkflowJob | undefined;
    update(jobId: string, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob;
}
export declare function parseWorkflowJob(value: unknown): WorkflowJob;
//# sourceMappingURL=job-store.d.ts.map