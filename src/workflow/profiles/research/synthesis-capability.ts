import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import {
	loadWorkflowExactCapabilityInput,
	workflowCapabilityInputJson,
} from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import type {
	WorkflowCapabilityActiveExecutionContext,
	WorkflowCapabilityExecutor,
} from "#internet/workflow/runtime/types";
import {
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";

export const RESEARCH_SYNTHESIS_CAPABILITY = {
	id: "research.synthesize_report",
	version: "1",
	acceptedNeedTypes: ["execution"],
	producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report, WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need],
	producedReceiptTypes: [],
	sideEffect: "READ_ONLY",
	requiredAuthority: [],
	executorKinds: ["research_synthesis"],
	inputSchema: { id: "workflow.research.synthesis.input", version: "1" },
	outputSchema: { id: "workflow.research.synthesis.output", version: "1" },
	policyHooks: ["research_evidence_set"],
} as const satisfies WorkflowCapabilityDescriptor;

export class WorkflowResearchSynthesisAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "research_synthesis";
	private readonly runner: WorkflowTeamRunner;
	private readonly artifacts: WorkflowArtifactStore;

	constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore) {
		this.runner = runner;
		this.artifacts = artifacts;
	}

	async execute(
		context: WorkflowCapabilityActiveExecutionContext,
		signal?: AbortSignal,
	): Promise<WorkflowSemanticExecutionResult> {
		const exact = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
		const evidence = exact.artifacts.filter(
			(artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
		);
		if (evidence.length === 0) throw new Error("research synthesis requires Evidence artifacts");
		const answer = await runWorkflowTeamCapability(this.runner, {
			runId: context.run.runId,
			inputBundle: context.inputBundle,
			scope: "research-synthesis",
			promptStrategy: "generic-debate",
			signal,
			task: [
				"Synthesize a concise research report from the exact typed Evidence below.",
				"Preserve uncertainty and disagreements. Do not invent sources beyond the supplied Evidence.",
				"",
				workflowCapabilityInputJson(exact),
			].join("\n"),
		});
		const reportId = `research-report:${context.run.runId}:${context.execution.executionId}`;
		return {
			executionId: context.execution.executionId,
			workItemId: context.workItem.workItemId,
			inputBundleId: context.inputBundle.bundleId,
			artifacts: [
				{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report,
					payload: {
						reportId,
						title: "Research report",
						body: answer,
						evidence: evidence.map((artifact) => ({ runId: artifact.runId, artifactId: artifact.artifactId })),
					},
				},
				{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
					payload: {
						needId: `assess:${reportId}`,
						type: "execution",
						requestOwner: { kind: "research_report", id: reportId },
						requestedCapability: "research.assess_report",
						question: "Assess whether the current report satisfies the admitted research criterion.",
						subjects: [{ kind: "workflow_run", id: context.run.runId }],
						relatedArtifacts: [],
					},
				},
			],
			receiptIds: [],
		};
	}
}
