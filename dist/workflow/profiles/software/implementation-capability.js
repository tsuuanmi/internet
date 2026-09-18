import { parseWorkflowDeliveryPayload, parseWorkflowNeedPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const SOFTWARE_IMPLEMENTATION_CAPABILITY = {
    id: "software.implementation_change",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.implementationOutput,
        WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
    ],
    producedReceiptTypes: ["software.pull_request"],
    sideEffect: "CONTROLLED_MUTATION",
    requiredAuthority: ["repository_mutation"],
    executorKinds: ["software_implementation"],
    inputSchema: { id: "workflow.software.implementation.input", version: "1" },
    outputSchema: { id: "workflow.software.implementation.output", version: "1" },
    policyHooks: ["software_mutation_scope", "exact_head_reconciliation"],
};
function relatedDeliveryRefs(artifacts, context) {
    const needArtifact = artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
    if (needArtifact === undefined)
        throw new Error("software implementation Need artifact does not exist");
    const need = parseWorkflowNeedPayload(needArtifact.payload);
    return need.relatedArtifacts.filter((ref) => {
        const artifact = artifacts.get(ref.runId, ref.artifactId);
        if (artifact?.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery)
            return false;
        parseWorkflowDeliveryPayload(artifact.payload);
        return true;
    });
}
function resultArtifacts(context, pr, invalidatedDeliveries) {
    const outputId = `pull-request:${pr.repository}#${pr.number}@${pr.headSha}`;
    return [
        {
            type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.implementationOutput,
            lineage: invalidatedDeliveries.map((artifact) => ({ relation: "invalidates", artifact })),
            payload: {
                outputId,
                kind: "pull_request_head",
                subject: { kind: "git_head", id: `${pr.repository}#${pr.number}`, version: pr.headSha },
                artifacts: context.inputBundle.artifacts,
                instructions: `Review pull request ${pr.url} at exact head ${pr.headSha}`,
            },
        },
        {
            type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
            payload: {
                needId: `review:${outputId}`,
                type: "execution",
                requestOwner: { kind: "implementation_output", id: outputId },
                requestedCapability: "software.review_current_state",
                question: `Review pull request ${pr.repository}#${pr.number} at exact head ${pr.headSha}`,
                subjects: [{ kind: "git_head", id: `${pr.repository}#${pr.number}@${pr.headSha}` }],
                relatedArtifacts: [],
            },
        },
    ];
}
export class WorkflowSoftwareImplementationAdapter {
    constructor(runner, project, artifacts) {
        this.kind = "software_implementation";
        this.runner = runner;
        this.project = project;
        this.artifacts = artifacts;
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
            artifacts: resultArtifacts(context, pr, relatedDeliveryRefs(this.artifacts, context)),
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
            artifacts: resultArtifacts(context, pr, relatedDeliveryRefs(this.artifacts, context)),
            receiptIds: [`software.pull_request:${pr.repository}#${pr.number}@${pr.headSha}`],
        };
    }
}
//# sourceMappingURL=implementation-capability.js.map