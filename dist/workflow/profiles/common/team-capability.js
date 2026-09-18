import { DEFAULT_TEAM_ACCOUNTS, DEFAULT_TEAM_SYNTHESIZER } from "#internet/core/accounts";
import { buildTeamPlan } from "#internet/team/plan";
export async function runWorkflowTeamCapability(runner, request) {
    const plan = buildTeamPlan({
        accounts: DEFAULT_TEAM_ACCOUNTS,
        rounds: runner.rounds,
        synthesize: true,
        synthesizer: DEFAULT_TEAM_SYNTHESIZER,
    });
    const transcript = [];
    let finalAnswer;
    for (const step of plan.steps) {
        const result = await runner.runStep({
            plan,
            step,
            task: request.task,
            transcript,
            promptStrategy: request.promptStrategy,
            sessionId: `workflow:${request.runId}:${request.scope}`,
            requestKey: `${request.runId}:${request.scope}:${request.inputBundle.workItemId}:${step.stepId}`,
            signal: request.signal,
        });
        if (!result.ok)
            throw new Error(result.error.message);
        if (result.turn !== undefined)
            transcript.push(result.turn);
        if (result.finalAnswer !== undefined)
            finalAnswer = result.finalAnswer;
    }
    if (finalAnswer === undefined || finalAnswer.trim() === "") {
        throw new Error(`workflow ${request.scope} capability did not produce a synthesis result`);
    }
    return finalAnswer;
}
//# sourceMappingURL=team-capability.js.map