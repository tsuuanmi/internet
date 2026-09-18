import type { WorkflowArtifactRef } from "#internet/workflow/kernel/types";
import { SOFTWARE_USER_FEEDBACK_SCHEMA } from "#internet/workflow/profiles/software/feedback-contract";
import type {
	WorkflowNeedRuntimeContext,
	WorkflowPendingActionMaterialization,
	WorkflowReadinessDecision,
	WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/types";
import {
	parseWorkflowDeliveryPayload,
	parseWorkflowImplementationOutputPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
} from "#internet/workflow/semantic/index";

function uniqueRefs(refs: readonly WorkflowArtifactRef[]): readonly WorkflowArtifactRef[] {
	const byKey = new Map<string, WorkflowArtifactRef>();
	for (const ref of refs) byKey.set(`${ref.runId}:${ref.artifactId}`, ref);
	return [...byKey.values()];
}

function deliveryValidationAction(
	context: WorkflowNeedRuntimeContext,
): WorkflowPendingActionMaterialization | undefined {
	if (context.need.requestOwner.kind !== "delivery") return undefined;
	const delivery = context.artifacts.find((artifact) => {
		if (artifact.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery) return false;
		return parseWorkflowDeliveryPayload(artifact.payload).deliveryId === context.need.requestOwner.id;
	});
	if (delivery === undefined) {
		throw new Error(`software validation Need references missing Delivery ${context.need.requestOwner.id}`);
	}
	const payload = parseWorkflowDeliveryPayload(delivery.payload);
	return {
		kind: "pending_action",
		actionType: "software.user_validation",
		responderPolicy: "USER_OR_LOCAL",
		responseSchema: SOFTWARE_USER_FEEDBACK_SCHEMA,
		blockingScope: [context.need.requestOwner],
		artifactBindings: [{ runId: delivery.runId, artifactId: delivery.artifactId }],
		subjectBindings: [
			{ subject: { kind: payload.subject.kind, id: payload.subject.id }, version: payload.subject.version },
		],
		timeoutPolicy: "WAIT_INDEFINITELY",
	};
}

function requiredReadinessArtifacts(context: WorkflowNeedRuntimeContext): readonly WorkflowArtifactRef[] {
	const refs: WorkflowArtifactRef[] = [...context.need.relatedArtifacts];
	if (context.need.requestOwner.kind === "implementation_output") {
		const output = context.artifacts.find((artifact) => {
			if (artifact.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.implementationOutput) return false;
			return parseWorkflowImplementationOutputPayload(artifact.payload).outputId === context.need.requestOwner.id;
		});
		if (output === undefined) {
			throw new Error(
				`software review Need references missing ImplementationOutput ${context.need.requestOwner.id}`,
			);
		}
		refs.push({ runId: output.runId, artifactId: output.artifactId });
	}
	return uniqueRefs(refs);
}

export function withSoftwareDeliveryFeedbackPolicy(base: WorkflowRuntimePolicy): WorkflowRuntimePolicy {
	return {
		materializeNeed(context) {
			return deliveryValidationAction(context) ?? base.materializeNeed(context);
		},
		readiness(context, workItem): WorkflowReadinessDecision {
			const decision = base.readiness(context, workItem);
			return {
				...decision,
				artifacts: uniqueRefs([...decision.artifacts, ...requiredReadinessArtifacts(context)]),
			};
		},
		convergence: (run) => base.convergence(run),
	};
}
