import { hashCanonicalJson } from "#internet/core/canonical-json";
import type {
	WorkflowArtifactLineage,
	WorkflowArtifactProducer,
	WorkflowArtifactRef,
	WorkflowInputFact,
	WorkflowVersionRef,
} from "#internet/workflow/kernel/types";

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeArtifactLineage(lineage: readonly WorkflowArtifactLineage[]): readonly WorkflowArtifactLineage[] {
	return [...lineage].sort((left, right) =>
		compareText(
			`${left.relation}\0${left.artifact.runId}\0${left.artifact.artifactId}`,
			`${right.relation}\0${right.artifact.runId}\0${right.artifact.artifactId}`,
		),
	);
}

export function normalizeArtifactRefs(artifacts: readonly WorkflowArtifactRef[]): readonly WorkflowArtifactRef[] {
	return [...artifacts].sort((left, right) =>
		compareText(`${left.runId}\0${left.artifactId}`, `${right.runId}\0${right.artifactId}`),
	);
}

export function normalizeInputFacts(facts: readonly WorkflowInputFact[]): readonly WorkflowInputFact[] {
	return [...facts].sort((left, right) => compareText(left.name, right.name));
}

export function workflowArtifactPayloadHash(payload: unknown): string {
	return hashCanonicalJson(payload);
}

export function workflowArtifactId(input: {
	readonly runId: string;
	readonly type: string;
	readonly schemaRef: WorkflowVersionRef;
	readonly producer: WorkflowArtifactProducer;
	readonly inputBundleId?: string;
	readonly lineage: readonly WorkflowArtifactLineage[];
	readonly payloadHash: string;
}): string {
	return hashCanonicalJson({ ...input, lineage: normalizeArtifactLineage(input.lineage) });
}

export function workflowInputBundleId(input: {
	readonly runId: string;
	readonly workItemId: string;
	readonly capability: WorkflowVersionRef;
	readonly projection: WorkflowVersionRef;
	readonly artifacts: readonly WorkflowArtifactRef[];
	readonly facts: readonly WorkflowInputFact[];
}): string {
	return hashCanonicalJson({
		...input,
		artifacts: normalizeArtifactRefs(input.artifacts),
		facts: normalizeInputFacts(input.facts),
	});
}
