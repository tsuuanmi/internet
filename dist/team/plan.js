import { getAccountDefinition } from "#internet/core/accounts";
import { getTeamPromptStrategy } from "#internet/team/prompt-strategy";
export function buildTeamPlan(options) {
    if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
        throw new Error("team debate rounds must be a positive integer");
    }
    if (options.accounts.length < 2)
        throw new Error("team debate requires at least two accounts");
    if (new Set(options.accounts).size !== options.accounts.length) {
        throw new Error("team debate accounts must not contain duplicates");
    }
    if (options.synthesize && !options.accounts.includes(options.synthesizer)) {
        throw new Error("team synthesizer must be one of the selected accounts");
    }
    const steps = [];
    let previousStepId;
    for (let round = 1; round <= options.rounds; round++) {
        for (let index = 0; index < options.accounts.length; index++) {
            const accountId = options.accounts[index];
            if (accountId === undefined)
                throw new Error("team plan member disappeared during construction");
            const stepId = `round:${round}:member:${index + 1}`;
            steps.push({
                kind: "member",
                stepId,
                round,
                member: index + 1,
                accountId,
                dependsOnStepIds: previousStepId === undefined ? [] : [previousStepId],
            });
            previousStepId = stepId;
        }
    }
    if (options.synthesize) {
        steps.push({
            kind: "synthesis",
            stepId: "synthesis",
            accountId: options.synthesizer,
            dependsOnStepIds: steps.filter((step) => step.kind === "member").map((step) => step.stepId),
        });
    }
    return {
        accounts: [...options.accounts],
        rounds: options.rounds,
        synthesize: options.synthesize,
        synthesizer: options.synthesizer,
        steps,
    };
}
export function prepareTeamStep(plan, step, task, transcript, promptStrategy) {
    const prompts = getTeamPromptStrategy(promptStrategy);
    if (step.kind === "synthesis") {
        return {
            step,
            accountId: step.accountId,
            provider: getAccountDefinition(step.accountId).provider,
            prompt: prompts.synthesis({ task, members: plan.accounts, transcript }),
        };
    }
    const others = latestOtherContributions(plan.accounts, step.accountId, transcript);
    return {
        step,
        accountId: step.accountId,
        provider: getAccountDefinition(step.accountId).provider,
        prompt: prompts.turn({
            task,
            accountId: step.accountId,
            members: plan.accounts,
            others,
            round: step.round,
        }),
    };
}
function latestOtherContributions(accounts, accountId, transcript) {
    return accounts
        .filter((other) => other !== accountId)
        .map((other) => {
        let text = "";
        for (let index = transcript.length - 1; index >= 0; index--) {
            const turn = transcript[index];
            if (turn?.accountId === other) {
                text = turn.text;
                break;
            }
        }
        return { accountId: other, provider: getAccountDefinition(other).provider, text };
    });
}
//# sourceMappingURL=plan.js.map