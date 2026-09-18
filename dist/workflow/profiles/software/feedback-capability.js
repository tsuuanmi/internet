import { loadWorkflowExactCapabilityInput, workflowCapabilityInputJson, } from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import { SOFTWARE_IMPLEMENTATION_CAPABILITY } from "#internet/workflow/profiles/software/implementation-capability";
import { parseWorkflowNeedPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
export const SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY = {
    id: "software.feedback_interpretation",
    version: "1",
    acceptedNeedTypes: ["execution"],
    producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding, WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need],
    producedReceiptTypes: [],
    sideEffect: "READ_ONLY",
    requiredAuthority: [],
    executorKinds: ["software_feedback_interpretation"],
    inputSchema: { id: "workflow.software.feedback.input", version: "1" },
    outputSchema: { id: "workflow.software.feedback.output", version: "1" },
    policyHooks: ["software_feedback_semantics"],
};
const OUTCOMES = ["NO_CHANGE", "IMPLEMENTATION_CHANGE", "PLAN_CHANGE", "REQUIREMENTS_CHANGE"];
function parseFeedbackInterpretation(value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error("software feedback capability did not return JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("software feedback capability returned an invalid result");
    }
    const record = parsed;
    if (typeof record.outcome !== "string" || !OUTCOMES.includes(record.outcome)) {
        throw new Error("software feedback capability returned an invalid outcome");
    }
    if (typeof record.summary !== "string" || record.summary.trim() === "") {
        throw new Error("software feedback capability returned an invalid summary");
    }
    return { outcome: record.outcome, summary: record.summary };
}
function consequenceNeed(need, outcome, summary) {
    const common = {
        needId: `feedback-consequence:${need.needId}`,
        requestOwner: { kind: "user_feedback", id: need.requestOwner.id },
        question: summary,
        subjects: need.subjects,
        relatedArtifacts: need.relatedArtifacts,
    };
    if (outcome === "IMPLEMENTATION_CHANGE") {
        return {
            type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
            payload: {
                ...common,
                type: "execution",
                requestedCapability: SOFTWARE_IMPLEMENTATION_CAPABILITY.id,
            },
        };
    }
    return {
        type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
        payload: {
            ...common,
            type: outcome === "PLAN_CHANGE" ? "plan_change" : "requirements_change",
            requestedCapability: "planning",
        },
    };
}
export class WorkflowSoftwareFeedbackInterpretationAdapter {
    constructor(runner, artifacts) {
        this.kind = "software_feedback_interpretation";
        this.runner = runner;
        this.artifacts = artifacts;
    }
    async execute(context, signal) {
        const needArtifact = this.artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
        if (needArtifact === undefined)
            throw new Error("software feedback Need artifact does not exist");
        const need = parseWorkflowNeedPayload(needArtifact.payload);
        const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
        const answer = await runWorkflowTeamCapability(this.runner, {
            runId: context.run.runId,
            inputBundle: context.inputBundle,
            scope: "software-feedback",
            promptStrategy: "generic-debate",
            signal,
            task: [
                "Interpret the exact typed User feedback for the software workflow.",
                "Do not mutate repository state.",
                "Classify the semantic consequence only.",
                'Return only JSON: {"outcome":"NO_CHANGE|IMPLEMENTATION_CHANGE|PLAN_CHANGE|REQUIREMENTS_CHANGE","summary":"..."}',
                "",
                `Feedback question/source: ${need.question}`,
                "",
                "Exact workflow input:",
                workflowCapabilityInputJson(exactInput),
            ].join("\n"),
        });
        const interpretation = parseFeedbackInterpretation(answer);
        const artifacts = [
            {
                type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
                payload: {
                    findingId: `feedback:${context.execution.executionId}`,
                    severity: interpretation.outcome === "NO_CHANGE" ? "info" : "warning",
                    summary: interpretation.summary,
                    subjects: need.subjects,
                    relatedArtifacts: need.relatedArtifacts,
                    needIds: [need.needId],
                },
            },
        ];
        if (interpretation.outcome !== "NO_CHANGE") {
            artifacts.push(consequenceNeed(need, interpretation.outcome, interpretation.summary));
        }
        return {
            executionId: context.execution.executionId,
            workItemId: context.workItem.workItemId,
            inputBundleId: context.inputBundle.bundleId,
            artifacts,
            receiptIds: [],
        };
    }
}
//# sourceMappingURL=feedback-capability.js.map