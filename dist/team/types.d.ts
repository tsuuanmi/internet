import type { AccountId } from "#internet/core/accounts";
import type { WebProvider } from "#internet/core/config";
import type { InternetErrorKind } from "#internet/core/errors";
export declare const TEAM_STAGES: readonly ["prepare_prompt", "provider_turn", "synthesis", "complete"];
export type TeamStage = (typeof TEAM_STAGES)[number];
export declare const TEAM_PROGRESS_STATUSES: readonly ["started", "completed", "failed"];
export type TeamProgressStatus = (typeof TEAM_PROGRESS_STATUSES)[number];
export type TeamFailureKind = InternetErrorKind | "unexpected_error";
/** One completed contribution in a team debate. */
export interface TeamTurn {
    readonly round: number;
    readonly accountId: AccountId;
    readonly provider: WebProvider;
    readonly text: string;
}
/** A teammate's latest message, shown to the current speaker. */
export interface OtherContribution {
    readonly accountId: AccountId;
    readonly provider: WebProvider;
    readonly text: string;
}
/** Structured execution failure produced by the shared team core. */
export interface TeamFailureDetail {
    readonly accountId: AccountId;
    readonly provider: WebProvider;
    readonly stage: TeamStage;
    readonly round?: number;
    readonly kind: TeamFailureKind;
    readonly message: string;
    readonly retryable: boolean;
    readonly failedAt: string;
}
/** Durable-friendly progress emitted around prompt preparation, provider turns, and synthesis. */
export interface TeamProgressEvent {
    readonly at: string;
    readonly stage: TeamStage;
    readonly status: TeamProgressStatus;
    readonly round?: number;
    readonly accountId: AccountId;
    readonly provider: WebProvider;
    readonly kind?: TeamFailureKind;
    readonly message?: string;
    readonly retryable?: boolean;
    /** Completed model text; observers may persist a bounded copy outside compact workflow state. */
    readonly text?: string;
}
//# sourceMappingURL=types.d.ts.map