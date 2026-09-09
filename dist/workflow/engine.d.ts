import { type WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowEventSink } from "#internet/workflow/events";
import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { type StartWorkflowInput, type WorkflowDecisionInput, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";
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
    private readonly maxReviewCycles;
    private readonly events?;
    constructor(jobs: WorkflowJobStore, teams?: WorkflowTeamRunner, prompts?: WorkflowTeamPromptBuilder, handoffs?: WorkflowHandoffStore, writer?: WorkflowWriterRunner, maxReviewCycles?: number, events?: WorkflowEventSink);
    start(input: StartWorkflowInput): WorkflowJob;
    status(jobId: string): WorkflowJob;
    runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    prepareResearchHandoffs(jobId: string): readonly WorkflowHandoff[];
    markHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob;
    startImplementationControl(jobId: string): WorkflowControlStep;
    /** Deliver exact research payloads to the persistent writer conversation, then execute START_IMPLEMENTATION. */
    runWriterImplementation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    /** Run the two independent reviewer lanes against the exact persisted PR head. */
    runReview(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    prepareReviewHandoffs(jobId: string): readonly WorkflowHandoff[];
    startApplyReviewsControl(jobId: string): WorkflowControlStep;
    /** Deliver reviewer finals verbatim, then either pass the review gate or remediate the same PR. */
    runWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    /** Read and persist exact-head PR/check health before merge authorization. */
    runPrHealthGate(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    /** Move a fully reviewed PR into the explicit user-authorization gate. */
    requestMergeAuthorization(jobId: string): WorkflowJob;
    /** Execute an already authorized exact-head merge through the persistent Website writer. */
    runWriterMerge(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
    private reviewLimitReached;
    private writerBlocked;
    private recordTeamResult;
    private update;
    markRetryRequired(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob;
    cancel(jobId: string): WorkflowJob;
    continue(jobId: string): WorkflowJob;
    approve(input: WorkflowDecisionInput): WorkflowJob;
    reject(input: WorkflowDecisionInput): WorkflowJob;
}
//# sourceMappingURL=engine.d.ts.map