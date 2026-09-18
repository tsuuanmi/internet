import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowArtifact, WorkflowArtifactRef, WorkflowInputBundle } from "#internet/workflow/kernel/types";

export interface WorkflowExactCapabilityInput {
	readonly inputBundle: WorkflowInputBundle;
	readonly artifacts: readonly WorkflowArtifact[];
}

export function loadWorkflowExactCapabilityInput(
	store: WorkflowArtifactStore,
	inputBundle: WorkflowInputBundle,
): WorkflowExactCapabilityInput {
	const artifacts = inputBundle.artifacts.map((ref) => {
		const artifact = store.get(ref.runId, ref.artifactId);
		if (artifact === undefined) throw new Error(`workflow capability input artifact ${ref.runId}:${ref.artifactId} does not exist`);
		return artifact;
	});
	return { inputBundle, artifacts };
}

export function workflowCapabilityInputJson(input: WorkflowExactCapabilityInput): string {
	return JSON.stringify({
		inputBundle: {
			bundleId: input.inputBundle.bundleId,
			runId: input.inputBundle.runId,
			workItemId: input.inputBundle.workItemId,
			capability: input.inputBundle.capability,
			projection: input.inputBundle.projection,
			artifactRefs: input.inputBundle.artifacts,
			facts: input.inputBundle.facts,
		},
		artifacts: input.artifacts.map((artifact) => ({
			ref: { runId: artifact.runId, artifactId: artifact.artifactId } satisfies WorkflowArtifactRef,
			type: artifact.type,
			schemaRef: artifact.schemaRef,
			payload: artifact.payload,
		})),
	});
}
