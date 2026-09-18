import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import {
	loadWorkflowExactCapabilityInput,
	workflowCapabilityInputJson,
} from "#internet/workflow/profiles/capability-context";
import { runWorkflowTeamCapability } from "#internet/workflow/profiles/common/team-capability";
import { parseWorkflowReviewResult } from "#internet/workflow/review-result";
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

export const SOFTWARE_REVIEW_CAPABILITY = {
	id: "software.review_current_state",
	version: "1",
	acceptedNeedTypes: ["execution"],
	producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence, WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding],
	producedReceiptTypes: [],
	sideEffect: "READ_ONLY",
	requiredAuthority: [],
	executorKinds: ["software_review"],
	inputSchema: { id: "workflow.software.review.input", version: "1" },
	outputSchema: { id: "workflow.software.review.output", version: "1" },
	policyHooks: ["exact_subject_review"],
} as const satisfies WorkflowCapabilityDescriptor;

export class WorkflowSoftwareReviewAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "software_review";
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
		if (needArtifact === undefined) throw new Error("software review Need artifact does not exist");
		const need = parseWorkflowNeedPayload(needArtifact.payload);
		const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
		const answer = await runWorkflowTeamCapability(this.runner, {
			runId: context.run.runId,
			inputBundle: context.inputBundle,
			scope: "software-review",
			promptStrategy: "workflow-review",
			signal,
			task: [
				"Review the exact software state described by the typed workflow input.",
				"Do not mutate repository state.",
				'Return only JSON: {"verdict":"PASS|CHANGES_REQUIRED","reviewedHeadSha":"40-lowercase-hex"}.',
				"",
				`Need: ${need.question}`,
				"",
				"Exact workflow input:",
				workflowCapabilityInputJson(exactInput),
			].join("\n"),
		});
		const review = parseWorkflowReviewResult(answer);
		const source = { kind: "capability_execution", id: context.execution.executionId };
		const subject = { kind: "git_head", id: review.reviewedHeadSha };
		return {
			executionId: context.execution.executionId,
			workItemId: context.workItem.workItemId,
			inputBundleId: context.inputBundle.bundleId,
			artifacts: [
				{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
					payload: {
						evidenceId: `software-review:${context.execution.executionId}`,
						summary: answer,
						subjects: [...need.subjects, subject],
						sourceRefs: [source],
						relatedArtifacts: context.inputBundle.artifacts,
					},
				},
				{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
					payload: {
						findingId: `software-review:${context.execution.executionId}`,
						severity: review.verdict === "PASS" ? "info" : "blocking",
						summary:
							review.verdict === "PASS"
								? `Exact head ${review.reviewedHeadSha} passed review`
								: `Exact head ${review.reviewedHeadSha} requires changes`,
						details: answer,
						subjects: [...need.subjects, subject],
						relatedArtifacts: context.inputBundle.artifacts,
						needIds: [need.needId],
					},
				},
			],
			receiptIds: [],
		};
	}
}
