import { loadWorkflowExactCapabilityInput, workflowCapabilityInputJson, } from "#internet/workflow/profiles/capability-context";
import { parseWorkflowNeedPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const EXTERNAL_DEEP_RESEARCH_CAPABILITY = {
    id: "research.external_deep_research",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence, WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report],
    producedReceiptTypes: [],
    sideEffect: "READ_ONLY",
    requiredAuthority: [],
    executorKinds: ["external_deep_research"],
    inputSchema: { id: "workflow.research.deep.input", version: "1" },
    outputSchema: { id: "workflow.research.deep.output", version: "1" },
    policyHooks: ["research_access"],
};
export class WorkflowExternalDeepResearchAdapter {
    constructor(browser, accountId, artifacts) {
        this.kind = "external_deep_research";
        this.browser = browser;
        this.accountId = accountId;
        this.artifacts = artifacts;
    }
    async execute(context, signal) {
        const needArtifact = this.artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
        if (needArtifact === undefined)
            throw new Error("deep research Need artifact does not exist");
        const need = parseWorkflowNeedPayload(needArtifact.payload);
        const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
        const result = await this.browser.research(this.accountId, {
            prompt: [
                "Perform deep research for the typed workflow Need below.",
                "Treat the exact InputBundle and Artifact payloads as authoritative scope.",
                "",
                `Need: ${need.question}`,
                "",
                "Exact workflow input:",
                workflowCapabilityInputJson(exactInput),
            ].join("\n"),
            sessionId: `workflow:${context.run.runId}:deep-research`,
            responseRepresentation: "text",
            signal,
        });
        const source = { kind: "provider_conversation", id: result.url };
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts: [
                {
                    type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
                    payload: {
                        evidenceId: `deep-research:${context.execution.executionId}`,
                        summary: result.text,
                        subjects: need.subjects,
                        sourceRefs: [source],
                        relatedArtifacts: context.inputBundle.artifacts,
                    },
                },
                {
                    type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report,
                    payload: {
                        reportId: `deep-research:${context.execution.executionId}`,
                        title: need.question,
                        body: result.text,
                        evidence: context.inputBundle.artifacts,
                    },
                },
            ],
            receiptIds: [],
        };
    }
}
//# sourceMappingURL=deep-research-capability.js.map