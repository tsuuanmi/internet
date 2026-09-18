export function loadWorkflowExactCapabilityInput(store, inputBundle) {
    const artifacts = inputBundle.artifacts.map((ref) => {
        const artifact = store.get(ref.runId, ref.artifactId);
        if (artifact === undefined)
            throw new Error(`workflow capability input artifact ${ref.runId}:${ref.artifactId} does not exist`);
        return artifact;
    });
    return { inputBundle, artifacts };
}
export function workflowCapabilityInputJson(input) {
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
            ref: { runId: artifact.runId, artifactId: artifact.artifactId },
            type: artifact.type,
            schemaRef: artifact.schemaRef,
            payload: artifact.payload,
        })),
    });
}
//# sourceMappingURL=capability-context.js.map