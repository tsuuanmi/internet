import { canonicalJson } from "#internet/core/canonical-json";
function artifactRefKey(ref) {
    return `${ref.runId}:${ref.artifactId}`;
}
function sameArtifactRefs(left, right) {
    const leftKeys = [...left].map(artifactRefKey).sort();
    const rightKeys = [...right].map(artifactRefKey).sort();
    return canonicalJson(leftKeys) === canonicalJson(rightKeys);
}
function sameVersionRef(left, right) {
    return left.id === right.id && left.version === right.version;
}
export function criterionAssessmentIsCurrent(assessment, requirement) {
    if (assessment.criterion.criteriaArtifact.runId !== requirement.criterion.criteriaArtifact.runId ||
        assessment.criterion.criteriaArtifact.artifactId !== requirement.criterion.criteriaArtifact.artifactId ||
        assessment.criterion.criterionId !== requirement.criterion.criterionId ||
        assessment.criterion.criterionVersion !== requirement.criterion.criterionVersion)
        return false;
    if (assessment.subject.kind !== requirement.subject.kind ||
        assessment.subject.id !== requirement.subject.id ||
        assessment.subject.version !== requirement.subject.version)
        return false;
    if (!sameVersionRef(assessment.policyRef, requirement.policyRef))
        return false;
    if (requirement.inputBundleId !== undefined && assessment.inputBundleId !== requirement.inputBundleId)
        return false;
    if (requirement.evidence !== undefined && !sameArtifactRefs(assessment.evidence, requirement.evidence))
        return false;
    return requirement.requiredMethods.includes(assessment.method);
}
//# sourceMappingURL=assessment.js.map