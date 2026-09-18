import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { loadWorkflowExactCapabilityInput, workflowCapabilityInputJson } from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
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

export class WorkflowTeamPlanningExecutor implements WorkflowPlanningExecutor {
	private readonly runner: WorkflowTeamRunner;
	private readonly artifacts: WorkflowArtifactStore;

	constructor(runner: WorkflowTeamRunner, artifacts: WorkflowArtifactStore) {
		this.runner = runner;
		this.artifacts = artifacts;
	}

	async execute(request: Parameters<WorkflowPlanningExecutor["execute"]>[0]): Promise<unknown> {
		const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, request.inputBundle);
		const answer = await runWorkflowTeamCapability(this.runner, {
			runId: request.inputBundle.runId,
			inputBundle: request.inputBundle,
			scope: "planning",
			promptStrategy: "generic-debate",
			task: [
				"Act as the workflow Planner for the exact typed input below.",
				`Planning mode: ${request.mode}`,
				"Return only one JSON object with this shape:",
				'{"mode":"INITIAL|PLAN_CHANGE|REQUIREMENTS_CHANGE|CLARIFICATION","objective":object?,"acceptanceCriteria":object?,"plan":object?,"needs":[],"findings":[]}',
				"Preserve exact IDs/references from the input where required; do not invent execution authority, provider identity, or runtime topology.",
				"",
				"Exact workflow input:",
				workflowCapabilityInputJson(exactInput),
			].join("\n"),
		});
		try {
			return JSON.parse(answer);
		} catch {
			throw new Error("workflow planning reasoning executor did not return the required JSON object");
		}
	}
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
