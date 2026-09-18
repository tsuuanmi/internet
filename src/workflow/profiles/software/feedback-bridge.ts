import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowExternalSignal, WorkflowPendingAction, WorkflowResponseProvenance } from "#internet/workflow/interactions/types";
import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import {
	parseWorkflowDeliveryPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	WORKFLOW_SEMANTIC_SCHEMA_REFS,
	type WorkflowFeedbackProvenance,
} from "#internet/workflow/semantic/index";
import {
	parseSoftwareUserFeedbackInput,
	SOFTWARE_USER_FEEDBACK_SCHEMA,
	type SoftwareUserFeedbackInput,
} from "#internet/workflow/profiles/software/feedback-contract";
import { SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY } from "#internet/workflow/profiles/software/feedback-capability";

export interface WorkflowSoftwareFeedbackBridgeDependencies {
	readonly artifacts: WorkflowArtifactStore;
	readonly inputBundles: WorkflowInputBundleStore;
}

function semanticProvenance(value: WorkflowResponseProvenance): WorkflowFeedbackProvenance {
	return value === "user_explicit" ? "user_explicit" : value === "local_agent" ? "local_agent" : "system_observed";
}

export class WorkflowSoftwareFeedbackBridge {
	private readonly dependencies: WorkflowSoftwareFeedbackBridgeDependencies;

	constructor(dependencies: WorkflowSoftwareFeedbackBridgeDependencies) {
		this.dependencies = dependencies;
	}

	onResolved(action: WorkflowPendingAction): void {
		if (action.actionType !== "software.user_validation" || action.state !== "RESOLVED" || action.resolution === undefined) {
			return;
		}
		const input = parseSoftwareUserFeedbackInput(action.resolution.payload);
		const delivery = this.boundDelivery(action.runId, action.artifactBindings.map((ref) => ref.artifactId));
		const payload = parseWorkflowDeliveryPayload(delivery.payload);
		if (!action.subjectBindings.some((binding) =>
			binding.subject.kind === payload.subject.kind &&
			binding.subject.id === payload.subject.id &&
			binding.version === payload.subject.version
		)) {
			throw new Error("software User validation action is not bound to the Delivery exact subject");
		}
		this.persistFeedback(
			action.runId,
			`action:${action.actionId}:${action.resolution.requestId}`,
			semanticProvenance(action.resolution.provenance),
			input,
			{ runId: delivery.runId, artifactId: delivery.artifactId },
			payload.subject.version,
		);
	}

	onSignal(signal: WorkflowExternalSignal): void {
		if (signal.signalType !== "software.user_feedback") return;
		if (signal.payloadSchema.id !== SOFTWARE_USER_FEEDBACK_SCHEMA.id || signal.payloadSchema.version !== SOFTWARE_USER_FEEDBACK_SCHEMA.version) {
			throw new Error("software User feedback signal uses the wrong schema");
		}
		const input = parseSoftwareUserFeedbackInput(signal.payload);
		if (input.targetDelivery === undefined || input.targetVersion === undefined) {
			throw new Error("software User feedback signal requires an exact Delivery target");
		}
		const delivery = this.boundDelivery(signal.runId, [input.targetDelivery.artifactId]);
		if (delivery.runId !== input.targetDelivery.runId) {
			throw new Error("software User feedback Delivery belongs to another run");
		}
		const payload = parseWorkflowDeliveryPayload(delivery.payload);
		if (payload.subject.version !== input.targetVersion) {
			throw new Error("software User feedback targets an obsolete Delivery version");
		}
		this.persistFeedback(
			signal.runId,
			`signal:${signal.signalId}`,
			semanticProvenance(signal.provenance),
			input,
			input.targetDelivery,
			input.targetVersion,
		);
	}

	private boundDelivery(runId: string, artifactIds: readonly string[]) {
		const current = currentWorkflowArtifactIds(
			this.dependencies.artifacts.list(runId),
			this.dependencies.inputBundles.list(runId),
		);
		const candidates = artifactIds
			.map((artifactId) => this.dependencies.artifacts.get(runId, artifactId))
			.filter((artifact) => artifact?.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery);
		if (candidates.length !== 1 || candidates[0] === undefined) {
			throw new Error("software User feedback requires exactly one bound Delivery");
		}
		if (!current.has(candidates[0].artifactId)) {
			throw new Error("software User feedback targets an obsolete Delivery");
		}
		return candidates[0];
	}

	private persistFeedback(
		runId: string,
		feedbackId: string,
		provenance: WorkflowFeedbackProvenance,
		input: SoftwareUserFeedbackInput,
		targetDelivery: { readonly runId: string; readonly artifactId: string },
		targetVersion: string,
	): void {
		const feedback = this.dependencies.artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.userFeedback,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.userFeedback,
			producer: { kind: "runtime", id: feedbackId },
			payload: {
				feedbackId,
				provenance,
				raw: input.raw,
				targetDelivery,
				targetVersion,
				attachments: [],
			},
		});
		this.dependencies.artifacts.create({
			runId,
			type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
			schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
			producer: { kind: "runtime", id: `feedback-interpretation:${feedbackId}` },
			payload: {
				needId: `feedback-interpretation:${feedbackId}`,
				type: "execution",
				requestOwner: { kind: "user_feedback", id: feedbackId },
				requestedCapability: SOFTWARE_FEEDBACK_INTERPRETATION_CAPABILITY.id,
				question: input.raw,
				subjects: [{ kind: "delivery", id: `${targetDelivery.artifactId}@${targetVersion}` }],
				relatedArtifacts: [
					{ runId: feedback.runId, artifactId: feedback.artifactId },
					targetDelivery,
				],
			},
		});
	}
}
