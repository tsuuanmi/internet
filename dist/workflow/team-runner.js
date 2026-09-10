import { runTeam } from "#internet/team/orchestrator";
/** Workflow-owned adapter over the single shared team engine. */
export class BrowserWorkflowTeamRunner {
    constructor(manager, config, observer) {
        this.manager = manager;
        this.config = config;
        this.observer = observer;
    }
    async run(request) {
        const observation = this.observer.begin(request.sessionId);
        const strategy = observation.context.phase === "research" ? "workflow-research" : "workflow-review";
        let failedProgress;
        const result = await runTeam((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
            task: request.task,
            sessionId: request.sessionId,
            rounds: this.config.teamRounds,
            synthesize: true,
            synthesizer: request.synthesizer,
            accounts: request.accounts,
            promptStrategy: strategy,
            visible: false,
            signal: request.signal,
            onProgress: (event) => {
                this.observer.record(observation, event);
                if (event.status === "failed")
                    failedProgress = event;
            },
        });
        if ("error" in result) {
            const failureEvent = failedProgress ??
                {
                    at: result.error.failedAt,
                    stage: result.error.stage,
                    status: "failed",
                    ...(result.error.round === undefined ? {} : { round: result.error.round }),
                    accountId: result.error.accountId,
                    provider: result.error.provider,
                    kind: result.error.kind,
                    message: result.error.message,
                    retryable: result.error.retryable,
                };
            this.observer.fail(observation, failureEvent);
            return {
                ok: false,
                error: result.error.message,
                failedAccountId: result.error.accountId,
                failedProvider: result.error.provider,
                failure: result.error,
                transcript: result.transcript,
            };
        }
        this.observer.complete(observation, new Date().toISOString());
        return {
            ok: true,
            finalAnswer: result.finalAnswer,
            finalAccountId: result.finalAccountId,
            finalProvider: result.finalProvider,
            transcript: result.transcript,
        };
    }
}
//# sourceMappingURL=team-runner.js.map