import type { WorkflowArtifact, WorkflowInputBundle, WorkflowWorkItem } from "#internet/workflow/kernel/types";

const INVALIDATING_RELATIONS = new Set(["supersedes", "invalidates"]);

export function currentWorkflowArtifactIds(artifacts: readonly WorkflowArtifact[]): ReadonlySet<string> {
	const stale = new Set<string>();
	for (const artifact of artifacts) {
		for (const lineage of artifact.lineage) {
			if (lineage.artifact.runId === artifact.runId && INVALIDATING_RELATIONS.has(lineage.relation))
				stale.add(lineage.artifact.artifactId);
		}
	}
	return new Set(artifacts.filter((artifact) => !stale.has(artifact.artifactId)).map((artifact) => artifact.artifactId));
}

export function workflowInputBundleIsCurrent(
	bundle: WorkflowInputBundle,
	artifacts: readonly WorkflowArtifact[],
): boolean {
	const current = currentWorkflowArtifactIds(artifacts);
	return bundle.artifacts.every((ref) => ref.runId !== bundle.runId || current.has(ref.artifactId));
}

export function staleWorkflowWorkItems(
	workItems: readonly WorkflowWorkItem[],
	bundles: readonly WorkflowInputBundle[],
	artifacts: readonly WorkflowArtifact[],
): readonly WorkflowWorkItem[] {
	const byId = new Map(bundles.map((bundle) => [bundle.bundleId, bundle]));
	return workItems.filter((item) => {
		if (item.inputBundleId === undefined || ["CANCELLED", "FENCED"].includes(item.state)) return false;
		const bundle = byId.get(item.inputBundleId);
		return bundle !== undefined && !workflowInputBundleIsCurrent(bundle, artifacts);
	});
}
