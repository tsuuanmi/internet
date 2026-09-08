import { type WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { type StartWorkflowInput, type WorkflowDecisionInput, type WorkflowJob } from "#internet/workflow/types";
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
    constructor(jobs: WorkflowJobStore, teams?: WorkflowTeamRunner, prompts?: WorkflowTeamPromptBuilder, handoffs?: WorkflowHandoffStore);
    start(input: StartWorkflowInput): WorkflowJob;
    status(jobId: string): WorkflowJob;
    /** Run pending/failed research lanes concurrently; completed lanes are never repeated. */
    runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    /** Materialize exact research finals as durable data-plane handoffs. Idempotent by lane/sequence. */
    prepareResearchHandoffs(jobId: string): readonly WorkflowHandoff[];
    /** Mark a delivery only when the receiver consumed the exact expected payload hash. */
    markHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob;
    /**
     * Produce the trusted START_IMPLEMENTATION control only after both exact
     * research data messages have delivery receipts. Replays are safe.
     */
    startImplementationControl(jobId: string): WorkflowControlStep;
    private recordTeamResult;
    cancel(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
    approve(input: WorkflowDecisionInput): WorkflowJob;
    reject(input: WorkflowDecisionInput): WorkflowJob;
}
//# sourceMappingURL=engine.d.ts.map