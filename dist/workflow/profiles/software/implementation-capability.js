import { WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const SOFTWARE_IMPLEMENTATION_CAPABILITY = {
    id: "software.implementation_change",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery],
    producedReceiptTypes: ["software.pull_request"],
    sideEffect: "CONTROLLED_MUTATION",
    requiredAuthority: ["repository_mutation"],
    executorKinds: ["software_implementation"],
    inputSchema: { id: "workflow.software.implementation.input", version: "1" },
    outputSchema: { id: "workflow.software.implementation.output", version: "1" },
    policyHooks: ["software_mutation_scope", "exact_head_reconciliation"],
};
export class WorkflowSoftwareImplementationAdapter {
    constructor(runner, project) {
        this.kind = "software_implementation";
        this.runner = runner;
        this.project = project;
    }
    async execute(context) {
        const result = await this.runner.runControl(this.project(context));
        if (result.status !== "PR_OPEN") {
            throw new Error(`software implementation did not produce a reconciled PR: ${result.message}`);
        }
        const pr = result.pullRequest;
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts: [
                {
                    type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery,
                    payload: {
                        deliveryId: `pull-request:${pr.repository}#${pr.number}@${pr.headSha}`,
                        kind: "pull_request",
                        subject: { kind: "git_head", id: `${pr.repository}#${pr.number}`, version: pr.headSha },
                        artifacts: context.inputBundle.artifacts,
                        instructions: `Review pull request ${pr.url} at exact head ${pr.headSha}`,
                    },
                },
            ],
            receiptIds: [`software.pull_request:${pr.repository}#${pr.number}@${pr.headSha}`],
        };
    }
    async reconcile(context) {
        const result = await this.runner.runControl(this.project(context));
        if (result.status !== "PR_OPEN")
            return undefined;
        const pr = result.pullRequest;
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts: [
                {
                    type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery,
                    payload: {
                        deliveryId: `pull-request:${pr.repository}#${pr.number}@${pr.headSha}`,
                        kind: "pull_request",
                        subject: { kind: "git_head", id: `${pr.repository}#${pr.number}`, version: pr.headSha },
                        artifacts: context.inputBundle.artifacts,
                        instructions: `Review pull request ${pr.url} at exact head ${pr.headSha}`,
                    },
                },
            ],
            receiptIds: [`software.pull_request:${pr.repository}#${pr.number}@${pr.headSha}`],
        };
    }
}
//# sourceMappingURL=implementation-capability.js.map