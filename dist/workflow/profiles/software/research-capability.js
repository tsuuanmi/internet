import { loadWorkflowExactCapabilityInput, workflowCapabilityInputJson, } from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import { parseWorkflowNeedPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const SOFTWARE_REPOSITORY_RESEARCH_CAPABILITY = {
    id: "software.repository_research",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence],
    producedReceiptTypes: [],
    sideEffect: "READ_ONLY",
    requiredAuthority: [],
    executorKinds: ["software_repository_research"],
    inputSchema: { id: "workflow.software.repository-research.input", version: "1" },
    outputSchema: { id: "workflow.software.repository-research.output", version: "1" },
    policyHooks: ["software_repository_scope"],
};
export class WorkflowSoftwareRepositoryResearchAdapter {
    constructor(runner, artifacts) {
        this.kind = "software_repository_research";
        this.runner = runner;
        this.artifacts = artifacts;
    }
    async execute(context, signal) {
        const needArtifact = this.artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
        if (needArtifact === undefined)
            throw new Error("software repository research Need artifact does not exist");
        const need = parseWorkflowNeedPayload(needArtifact.payload);
        const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
        const answer = await runWorkflowTeamCapability(this.runner, {
            runId: context.run.runId,
            inputBundle: context.inputBundle,
            scope: "software-repository-research",
            promptStrategy: "workflow-research",
            signal,
            task: [
                "Perform repository research for the typed workflow Need below.",
                "Treat the exact InputBundle and Artifact payloads as authoritative scope.",
                "Return one implementation-ready evidence summary; do not mutate repository state.",
                "",
                `Need: ${need.question}`,
                "",
                "Exact workflow input:",
                workflowCapabilityInputJson(exactInput),
            ].join("\n"),
        });
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts: [
                {
                    type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
                    payload: {
                        evidenceId: `repository-research:${context.execution.executionId}`,
                        summary: answer,
                        subjects: need.subjects,
                        sourceRefs: [{ kind: "capability_execution", id: context.execution.executionId }],
                        relatedArtifacts: context.inputBundle.artifacts,
                    },
                },
            ],
            receiptIds: [],
        };
    }
}
//# sourceMappingURL=research-capability.js.map