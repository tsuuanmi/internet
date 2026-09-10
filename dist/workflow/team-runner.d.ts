import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import type { TeamFailureDetail, TeamTurn } from "#internet/team/types";
import type { WorkflowTeamObserver } from "#internet/workflow/team-observer";
export interface WorkflowTeamRunRequest {
    readonly task: string;
    readonly sessionId: string;
    readonly accounts: readonly AccountId[];
    readonly synthesizer: AccountId;
    readonly signal?: AbortSignal;
}
export type WorkflowTeamRunResult = {
    readonly ok: true;
    readonly finalAnswer: string;
    readonly finalAccountId: AccountId;
    readonly finalProvider: WebProvider;
    readonly transcript?: readonly TeamTurn[];
} | {
    readonly ok: false;
    readonly error: string;
    readonly failedAccountId: AccountId;
    readonly failedProvider: WebProvider;
    readonly failure?: TeamFailureDetail;
    readonly transcript?: readonly TeamTurn[];
};
export interface WorkflowTeamRunner {
    run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}
type TeamManager = Pick<BrowserManager, "chat">;
/** Workflow-owned adapter over the single shared team engine. */
export declare class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
    private readonly manager;
    private readonly config;
    private readonly observer;
    constructor(manager: TeamManager, config: BrowserConfig, observer: WorkflowTeamObserver);
    run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}
export {};
//# sourceMappingURL=team-runner.d.ts.map