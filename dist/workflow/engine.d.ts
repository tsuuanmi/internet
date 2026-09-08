import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { type StartWorkflowInput, type WorkflowDecisionInput, type WorkflowJob } from "#internet/workflow/types";
export declare class WorkflowEngineError extends Error {
    constructor(message: string);
}
export declare class WorkflowEngine {
    private readonly jobs;
    private readonly teams?;
    private readonly prompts;
    constructor(jobs: WorkflowJobStore, teams?: WorkflowTeamRunner, prompts?: WorkflowTeamPromptBuilder);
    start(input: StartWorkflowInput): WorkflowJob;
    status(jobId: string): WorkflowJob;
    /** Run pending/failed research lanes concurrently; completed lanes are never repeated. */
    runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    private recordTeamResult;
    cancel(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
    approve(input: WorkflowDecisionInput): WorkflowJob;
    reject(input: WorkflowDecisionInput): WorkflowJob;
}
//# sourceMappingURL=engine.d.ts.map