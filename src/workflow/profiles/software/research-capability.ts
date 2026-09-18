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
	parseWorkflowNeedPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";

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
} as const satisfies WorkflowCapabilityDescriptor;

export class WorkflowSoftwareRepositoryResearchAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "software_repository_research";
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
		const needArtifact = this.artifacts.get(
			context.workItem.needArtifact.runId,
			context.workItem.needArtifact.artifactId,
		);
		if (needArtifact === undefined) throw new Error("software repository research Need artifact does not exist");
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
