import { type WorkflowJob } from "#internet/workflow/types";
export declare class WorkflowJobStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowJobStore {
    private readonly jobsDir;
    constructor(dataDir: string);
    pathFor(jobId: string): string;
    create(job: WorkflowJob): WorkflowJob;
    get(jobId: string): WorkflowJob | undefined;
    list(): readonly WorkflowJob[];
    update(jobId: string, expectedRevision: number, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob;
}
export declare function parseWorkflowJob(value: unknown): WorkflowJob;
//# sourceMappingURL=job-store.d.ts.map