import { loadWorkflowExactCapabilityInput, workflowCapabilityInputJson, } from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import { parseWorkflowAcceptanceCriteriaPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const RESEARCH_ASSESSMENT_CAPABILITY = {
    id: "research.assess_report",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.criterionAssessment],
    producedReceiptTypes: [],
    sideEffect: "READ_ONLY",
    requiredAuthority: [],
    executorKinds: ["research_assessment"],
    inputSchema: { id: "workflow.research.assessment.input", version: "1" },
    outputSchema: { id: "workflow.research.assessment.output", version: "1" },
    policyHooks: ["research_report_assessment"],
};
function parseVerdict(answer) {
    let value;
    try {
        value = JSON.parse(answer);
    }
    catch {
        throw new Error("research assessment did not return the required JSON object");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("research assessment result is invalid");
    }
    const record = value;
    if (!["SATISFIED", "UNSATISFIED", "INCONCLUSIVE"].includes(record.verdict)) {
        throw new Error("research assessment verdict is invalid");
    }
    if (typeof record.summary !== "string" || record.summary.trim() === "") {
        throw new Error("research assessment summary is invalid");
    }
    return { verdict: record.verdict, summary: record.summary };
}
export class WorkflowResearchAssessmentAdapter {
    constructor(runner, artifacts) {
        this.kind = "research_assessment";
        this.runner = runner;
        this.artifacts = artifacts;
    }
    async execute(context, signal) {
        const exact = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
        const criteriaArtifact = exact.artifacts.find((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria);
        const report = exact.artifacts.find((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report);
        if (criteriaArtifact === undefined || report === undefined) {
            throw new Error("research assessment requires AcceptanceCriteria and Report artifacts");
        }
        const criteria = parseWorkflowAcceptanceCriteriaPayload(criteriaArtifact.payload);
        const criterion = criteria.criteria.find((item) => item.criterionId === "research-report");
        if (criterion === undefined)
            throw new Error("research report criterion does not exist");
        const answer = await runWorkflowTeamCapability(this.runner, {
            runId: context.run.runId,
            inputBundle: context.inputBundle,
            scope: "research-assessment",
            promptStrategy: "workflow-review",
            signal,
            task: [
                "Assess the exact research report against the exact admitted criterion.",
                'Return only JSON: {"verdict":"SATISFIED|UNSATISFIED|INCONCLUSIVE","summary":"short explanation"}.',
                "",
                workflowCapabilityInputJson(exact),
            ].join("\n"),
        });
        const result = parseVerdict(answer);
        const evidence = exact.artifacts
            .filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence)
            .map((artifact) => ({ runId: artifact.runId, artifactId: artifact.artifactId }));
        const drafts = [
            {
                type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.criterionAssessment,
                payload: {
                    criterion: {
                        criteriaArtifact: { runId: criteriaArtifact.runId, artifactId: criteriaArtifact.artifactId },
                        criterionId: criterion.criterionId,
                        criterionVersion: criterion.version,
                    },
                    subject: { kind: "workflow_run", id: context.run.runId, version: context.run.admissionId },
                    method: "reviewer",
                    verdict: result.verdict,
                    policyRef: { id: "research.assessment", version: "1" },
                    inputBundleId: context.inputBundle.bundleId,
                    evidence,
                    findingIds: [],
                },
            },
        ];
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts: drafts,
            receiptIds: [],
        };
    }
}
//# sourceMappingURL=assessment-capability.js.map