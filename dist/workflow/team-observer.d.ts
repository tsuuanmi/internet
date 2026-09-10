import type { TeamProgressEvent } from "#internet/team/types";
import type { WorkflowEventSink } from "#internet/workflow/events";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";
export interface WorkflowTeamContext {
    readonly jobId: string;
    readonly phase: WorkflowTeamPhase;
    readonly lane: WorkflowTeamLane;
}
export interface WorkflowTeamObservation {
    readonly context: WorkflowTeamContext;
    readonly attempt: number;
}
export interface WorkflowTeamObserver {
    begin(sessionId: string): WorkflowTeamObservation;
    record(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
    complete(observation: WorkflowTeamObservation, at: string): void;
    fail(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
}
export declare function parseWorkflowTeamSessionId(sessionId: string): WorkflowTeamContext;
/** Persist team traces first, then emit compact best-effort Local progress notifications. */
export declare class DurableWorkflowTeamObserver implements WorkflowTeamObserver {
    private readonly traces;
    private readonly jobs;
    private readonly events?;
    constructor(traces: WorkflowTeamTraceStore, jobs: WorkflowJobStore, events?: WorkflowEventSink);
    begin(sessionId: string): WorkflowTeamObservation;
    record(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
    complete(observation: WorkflowTeamObservation, at: string): void;
    fail(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
    private publish;
}
//# sourceMappingURL=team-observer.d.ts.map