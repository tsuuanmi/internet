import type { AccountId } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
import type { TeamFailureKind, TeamProgressStatus, TeamStage } from "#internet/team/types";
import type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
export declare const WORKFLOW_TEAM_TRACE_SCHEMA: "@tsuuanmi/internet-workflow-team-trace";
export declare const MAX_WORKFLOW_TEAM_TRACE_EVENTS = 400;
export declare const MAX_WORKFLOW_TEAM_TRACE_TEXT_CHARS = 12000;
export type WorkflowTeamTraceStage = "team" | TeamStage | "output_contract";
export interface WorkflowTeamTraceEvent {
    readonly phase: WorkflowTeamPhase;
    readonly lane: WorkflowTeamLane;
    readonly attempt: number;
    readonly at: string;
    readonly stage: WorkflowTeamTraceStage;
    readonly status: TeamProgressStatus;
    readonly round?: number;
    readonly accountId?: AccountId;
    readonly provider?: WebProvider;
    readonly kind?: TeamFailureKind | "output_contract";
    readonly message?: string;
    readonly retryable?: boolean;
    readonly text?: string;
    readonly textTruncated?: "prefix";
}
export declare class WorkflowTeamTraceStoreError extends Error {
    constructor(message: string);
}
/** Durable bounded per-job team execution evidence, separate from compact workflow job state. */
export declare class WorkflowTeamTraceStore {
    private readonly traceDir;
    constructor(dataDir: string);
    pathFor(jobId: string): string;
    list(jobId: string): readonly WorkflowTeamTraceEvent[];
    begin(jobId: string, phase: WorkflowTeamPhase, lane: WorkflowTeamLane, at: string): number;
    append(jobId: string, event: WorkflowTeamTraceEvent): void;
    private read;
}
//# sourceMappingURL=team-trace-store.d.ts.map