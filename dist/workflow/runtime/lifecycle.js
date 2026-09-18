import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import { evaluateWorkflowConvergence, WORKFLOW_SEMANTIC_ARTIFACT_TYPES } from "#internet/workflow/semantic/index";
const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);
export function projectWorkflowRunLifecycle(dependencies, run, now) {
    if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
        return run;
    const convergence = dependencies.policy.convergence(run);
    const result = evaluateWorkflowConvergence(convergence.policy, convergence.state);
    let lifecycle;
    if (result.converged) {
        lifecycle = "COMPLETED";
    }
    else {
        const autonomous = dependencies.workItems
            .list(run.runId)
            .some((item) => item.state === "READY" || item.state === "RUNNING");
        const artifacts = dependencies.artifacts.list(run.runId);
        const currentArtifacts = currentWorkflowArtifactIds(artifacts, dependencies.inputBundles.list(run.runId));
        const openExternal = artifacts
            .filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need && currentArtifacts.has(artifact.artifactId))
            .some((artifact) => dependencies.pendingActions.hasOpen(run.runId, artifact.artifactId) ||
            dependencies.awaitables.hasOpen(run.runId, artifact.artifactId));
        lifecycle = autonomous ? "ACTIVE" : openExternal ? "WAITING_EXTERNAL" : "BLOCKED";
    }
    if (lifecycle === run.lifecycle)
        return run;
    return dependencies.runs.update(run.runId, run.revision, (current) => ({
        ...current,
        revision: current.revision + 1,
        lifecycle,
        updatedAt: new Date(now()).toISOString(),
    }));
}
//# sourceMappingURL=lifecycle.js.map