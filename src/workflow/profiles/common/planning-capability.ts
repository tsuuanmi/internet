import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityExecutor, WorkflowCapabilityActiveExecutionContext } from "#internet/workflow/runtime/types";
import {
	executeWorkflowPlanning,
	parseWorkflowNeedPayload,
	WORKFLOW_PLANNING_CAPABILITY,
	type WorkflowPlanningExecutor,
	type WorkflowPlanningOutput,
	workflowPlanningModeForNeedType,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticArtifactDraft,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";

function revisionLineage(payload: { readonly supersedes?: { readonly runId: string; readonly artifactId: string } }) {
	return payload.supersedes === undefined ? undefined : [{ relation: "supersedes" as const, artifact: payload.supersedes }];
}

function planningDrafts(output: WorkflowPlanningOutput): readonly WorkflowSemanticArtifactDraft[] {
	return [
		...(output.objective === undefined
			? []
			: [{ type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective, payload: output.objective, lineage: revisionLineage(output.objective) }]),
		...(output.acceptanceCriteria === undefined
			? []
			: [{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
					payload: output.acceptanceCriteria,
					lineage: revisionLineage(output.acceptanceCriteria),
				}]),
		...(output.plan === undefined
			? []
			: [{ type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.plan, payload: output.plan, lineage: revisionLineage(output.plan) }]),
		...output.needs.map((payload) => ({ type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need, payload })),
		...output.findings.map((payload) => ({ type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding, payload })),
	];
}

export class WorkflowPlanningCapabilityAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "reasoning";
	private readonly planning: WorkflowPlanningExecutor;
	private readonly artifacts: WorkflowArtifactStore;

	constructor(planning: WorkflowPlanningExecutor, artifacts: WorkflowArtifactStore) {
		this.planning = planning;
		this.artifacts = artifacts;
	}

	async execute(
		context: WorkflowCapabilityActiveExecutionContext,
	): Promise<WorkflowSemanticExecutionResult> {
		if (
			context.workItem.capability.id !== WORKFLOW_PLANNING_CAPABILITY.id ||
			context.workItem.capability.version !== WORKFLOW_PLANNING_CAPABILITY.version
		) {
			throw new Error("planning capability adapter received a non-planning WorkItem");
		}
		const needArtifact = this.artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
		if (needArtifact === undefined) throw new Error("planning capability Need artifact does not exist");
		const need = parseWorkflowNeedPayload(needArtifact.payload);
		const mode = workflowPlanningModeForNeedType(need.type);
		if (mode === undefined) throw new Error(`Need type ${need.type} cannot execute through the planning capability`);
		const output = await executeWorkflowPlanning(this.planning, { mode, inputBundle: context.inputBundle });
		return {
			executionId: context.execution.executionId,
			workItemId: context.workItem.workItemId,
			inputBundleId: context.inputBundle.bundleId,
			artifacts: planningDrafts(output),
			receiptIds: [],
		};
	}
}
