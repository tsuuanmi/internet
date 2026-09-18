import type { WorkflowArtifact, WorkflowArtifactRef } from "#internet/workflow/kernel/types";
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
	parseWorkflowImplementationOutputPayload,
	parseWorkflowNeedPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticArtifactDraft,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";

export const SOFTWARE_REVIEW_CAPABILITY = {
	id: "software.review_current_state",
	version: "1",
	acceptedNeedTypes: ["execution"],
	producedArtifactTypes: [
		WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
		WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
		WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery,
		WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
	],
	producedReceiptTypes: [],
	sideEffect: "READ_ONLY",
	requiredAuthority: [],
	executorKinds: ["software_review"],
	inputSchema: { id: "workflow.software.review.input", version: "1" },
	outputSchema: { id: "workflow.software.review.output", version: "1" },
	policyHooks: ["exact_subject_review"],
} as const satisfies WorkflowCapabilityDescriptor;

function exactImplementationOutput(
	artifacts: readonly WorkflowArtifact[],
	reviewedHeadSha: string,
): { artifact: WorkflowArtifact; ref: WorkflowArtifactRef; payload: ReturnType<typeof parseWorkflowImplementationOutputPayload> } {
	const matches = artifacts
		.filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.implementationOutput)
		.map((artifact) => ({ artifact, payload: parseWorkflowImplementationOutputPayload(artifact.payload) }))
		.filter(({ payload }) => payload.subject.version === reviewedHeadSha);
	if (matches.length !== 1 || matches[0] === undefined) {
		throw new Error("software review result does not bind exactly one ImplementationOutput for the reviewed head");
	}
	return {
		artifact: matches[0].artifact,
		ref: { runId: matches[0].artifact.runId, artifactId: matches[0].artifact.artifactId },
		payload: matches[0].payload,
	};
}

export class WorkflowSoftwareReviewAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "software_review";
	private readonly runner: WorkflowTeamRunner;
	private readonly artifacts: WorkflowArtifactStore;
	private readonly requireUserValidation: boolean;

	constructor(
		runner: WorkflowTeamRunner,
		artifacts: WorkflowArtifactStore,
		options: { readonly requireUserValidation?: boolean } = {},
	) {
		this.runner = runner;
		this.artifacts = artifacts;
		this.requireUserValidation = options.requireUserValidation ?? true;
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
		const implementation = exactImplementationOutput(exactInput.artifacts, review.reviewedHeadSha);
		const source = { kind: "capability_execution", id: context.execution.executionId };
		const subject = implementation.payload.subject;
		const artifacts: WorkflowSemanticArtifactDraft[] = [
			{
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
				payload: {
					evidenceId: `software-review:${context.execution.executionId}`,
					summary: answer,
					subjects: [...need.subjects, { kind: subject.kind, id: `${subject.id}@${subject.version}` }],
					sourceRefs: [source],
					relatedArtifacts: [implementation.ref],
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
					subjects: [...need.subjects, { kind: subject.kind, id: `${subject.id}@${subject.version}` }],
					relatedArtifacts: [implementation.ref],
					needIds: [need.needId],
				},
			},
		];
		if (review.verdict === "PASS") {
			const deliveryId = `reviewed:${implementation.payload.outputId}`;
			artifacts.push({
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery,
				payload: {
					deliveryId,
					kind: "reviewed_pull_request",
					subject,
					artifacts: [implementation.ref],
					instructions: implementation.payload.instructions,
				},
			});
			if (this.requireUserValidation) {
				artifacts.push({
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
					payload: {
						needId: `user-validation:${deliveryId}`,
						type: "clarification",
						requestOwner: { kind: "delivery", id: deliveryId },
						question: `Validate the reviewed delivery at exact head ${subject.version} and provide typed feedback.`,
						subjects: [{ kind: subject.kind, id: `${subject.id}@${subject.version}` }],
						relatedArtifacts: [implementation.ref],
					},
				});
			}
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
