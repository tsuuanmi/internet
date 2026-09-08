import { type WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { type StartWorkflowInput, type WorkflowDecisionInput, type WorkflowJob } from "#internet/workflow/types";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";
export declare class WorkflowEngineError extends Error {
    constructor(message: string);
}
export interface WorkflowControlStep {
    readonly job: WorkflowJob;
    readonly control: WorkflowControlMessage;
}
export declare class WorkflowEngine {
    private readonly jobs;
    private readonly teams?;
    private readonly prompts;
    private readonly handoffs?;
    private readonly writer?;
    constructor(jobs: WorkflowJobStore, teams?: WorkflowTeamRunner, prompts?: WorkflowTeamPromptBuilder, handoffs?: WorkflowHandoffStore, writer?: WorkflowWriterRunner);
    start(input: StartWorkflowInput): WorkflowJob;
    status(jobId: string): WorkflowJob;
    runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    prepareResearchHandoffs(jobId: string): readonly WorkflowHandoff[];
    markHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob;
    startImplementationControl(jobId: string): WorkflowControlStep;
    /** Deliver exact research payloads to the persistent writer conversation, then execute START_IMPLEMENTATION. */
    runWriterImplementation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    private recordTeamResult;
    cancel(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
    approve(input: WorkflowDecisionInput): WorkflowJob;
    reject(input: WorkflowDecisionInput): WorkflowJob;
}
//# sourceMappingURL=engine.d.ts.map