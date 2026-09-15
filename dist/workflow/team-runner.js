import { runTeamStep } from "#internet/team/executor";
export class BrowserWorkflowTeamRunner {
    constructor(manager, config) {
        this.manager = manager;
        this.config = config;
    }
    runStep(request) {
        return runTeamStep((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
            plan: request.plan,
            step: request.step,
            task: request.task,
            transcript: request.transcript,
            promptStrategy: request.promptStrategy,
            sessionId: request.sessionId,
            visible: false,
            timeoutMs: this.config.workflowHardTimeoutMs,
            stallTimeoutMs: this.config.workflowStallTimeoutMs,
            signal: request.signal,
            onProgress: request.onProgress,
            onProviderProgress: request.onProviderProgress,
        });
    }
    get rounds() {
        return this.config.teamRounds;
    }
}
//# sourceMappingURL=team-runner.js.map