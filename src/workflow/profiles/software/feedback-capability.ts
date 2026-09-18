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
	type WorkflowNeedPayload,
	type WorkflowSemanticArtifactDraft,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { SOFTWARE_IMPLEMENTATION_CAPABILITY } from "#internet/workflow/profiles/software/implementation-capability";

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
} as const satisfies WorkflowCapabilityDescriptor;

const OUTCOMES = ["NO_CHANGE", "IMPLEMENTATION_CHANGE", "PLAN_CHANGE", "REQUIREMENTS_CHANGE"] as const;
type FeedbackOutcome = (typeof OUTCOMES)[number];

function parseFeedbackInterpretation(value: string): { outcome: FeedbackOutcome; summary: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error("software feedback capability did not return JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("software feedback capability returned an invalid result");
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.outcome !== "string" || !OUTCOMES.includes(record.outcome as FeedbackOutcome)) {
		throw new Error("software feedback capability returned an invalid outcome");
	}
	if (typeof record.summary !== "string" || record.summary.trim() === "") {
		throw new Error("software feedback capability returned an invalid summary");
	}
	return { outcome: record.outcome as FeedbackOutcome, summary: record.summary };
}

function consequenceNeed(
	need: WorkflowNeedPayload,
	outcome: Exclude<FeedbackOutcome, "NO_CHANGE">,
	summary: string,
): WorkflowSemanticArtifactDraft {
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

export class WorkflowSoftwareFeedbackInterpretationAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "software_feedback_interpretation";
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
		const needArtifact = this.artifacts.get(context.workItem.needArtifact.runId, context.workItem.needArtifact.artifactId);
		if (needArtifact === undefined) throw new Error("software feedback Need artifact does not exist");
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
		const artifacts: WorkflowSemanticArtifactDraft[] = [
			{
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding,
				payload: {
					findingId: `feedback:${context.execution.executionId}`,
					severity: interpretation.outcome === "NO_CHANGE" ? "info" : "blocking",
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
