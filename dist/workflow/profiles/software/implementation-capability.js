import { parseWorkflowDeliveryPayload, parseWorkflowNeedPayload, parseWorkflowUserFeedbackPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
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
    const refs = new Map();
    for (const ref of need.relatedArtifacts) {
        const artifact = artifacts.get(ref.runId, ref.artifactId);
        if (artifact?.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.userFeedback)
            continue;
        const feedback = parseWorkflowUserFeedbackPayload(artifact.payload);
        if (feedback.targetDelivery === undefined || feedback.targetVersion === undefined)
            continue;
        const target = artifacts.get(feedback.targetDelivery.runId, feedback.targetDelivery.artifactId);
        if (target?.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery) {
            throw new Error("software implementation feedback targets a missing Delivery");
        }
        const delivery = parseWorkflowDeliveryPayload(target.payload);
        if (feedback.targetVersion !== delivery.subject.version) {
            throw new Error("software implementation feedback targets an obsolete Delivery version");
        }
        refs.set(`${feedback.targetDelivery.runId}:${feedback.targetDelivery.artifactId}`, feedback.targetDelivery);
    }
    return [...refs.values()];
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