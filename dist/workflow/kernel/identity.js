import { hashCanonicalJson } from "#internet/core/canonical-json";
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export function normalizeArtifactLineage(lineage) {
    return [...lineage].sort((left, right) => compareText(`${left.relation}\0${left.artifact.runId}\0${left.artifact.artifactId}`, `${right.relation}\0${right.artifact.runId}\0${right.artifact.artifactId}`));
}
export function normalizeArtifactRefs(artifacts) {
    return [...artifacts].sort((left, right) => compareText(`${left.runId}\0${left.artifactId}`, `${right.runId}\0${right.artifactId}`));
}
export function normalizeInputFacts(facts) {
    return [...facts].sort((left, right) => compareText(left.name, right.name));
}
export function workflowArtifactPayloadHash(payload) {
    return hashCanonicalJson(payload);
}
export function workflowArtifactId(input) {
    return hashCanonicalJson({ ...input, lineage: normalizeArtifactLineage(input.lineage) });
}
export function workflowInputBundleId(input) {
    return hashCanonicalJson({
        ...input,
        artifacts: normalizeArtifactRefs(input.artifacts),
        facts: normalizeInputFacts(input.facts),
    });
}
//# sourceMappingURL=identity.js.map