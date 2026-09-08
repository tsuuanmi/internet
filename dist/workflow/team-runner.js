import { runTeam } from "#internet/team/orchestrator";
/**
 * Workflow-owned direct team runner. It calls the same lower-level team
 * primitive as `internet_team` without creating a free-form intermediary agent.
 */
export class BrowserWorkflowTeamRunner {
    constructor(manager, config) {
        this.manager = manager;
        this.config = config;
    }
    async run(request) {
        const result = await runTeam((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
            task: request.task,
            sessionId: request.sessionId,
            rounds: this.config.teamRounds,
            synthesize: true,
            synthesizer: request.synthesizer,
            accounts: request.accounts,
            visible: false,
            signal: request.signal,
        });
        if ("error" in result) {
            return {
                ok: false,
                error: result.error.message,
                failedAccountId: result.error.accountId,
                failedProvider: result.error.provider,
            };
        }
        return {
            ok: true,
            finalAnswer: result.finalAnswer,
            finalAccountId: result.finalAccountId,
            finalProvider: result.finalProvider,
        };
    }
}
//# sourceMappingURL=team-runner.js.map