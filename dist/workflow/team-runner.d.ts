import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
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
} | {
    readonly ok: false;
    readonly error: string;
    readonly failedAccountId: AccountId;
    readonly failedProvider: WebProvider;
};
export interface WorkflowTeamRunner {
    run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}
type TeamManager = Pick<BrowserManager, "chat">;
/**
 * Workflow-owned direct team runner. It calls the same lower-level team
 * primitive as `internet_team` without creating a free-form intermediary agent.
 */
export declare class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
    private readonly manager;
    private readonly config;
    constructor(manager: TeamManager, config: BrowserConfig);
    run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}
export {};
//# sourceMappingURL=team-runner.d.ts.map