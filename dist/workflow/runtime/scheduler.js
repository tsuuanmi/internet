import { hashCanonicalJson } from "#internet/core/canonical-json";
import { WORKFLOW_WORK_ITEM_SCHEMA, } from "#internet/workflow/kernel/types";
import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import { routeWorkflowCapability } from "#internet/workflow/runtime/routing";
import { parseWorkflowNeedPayload, WORKFLOW_SEMANTIC_ARTIFACT_TYPES } from "#internet/workflow/semantic/index";
function uniqueArtifactRefs(refs) {
    const byKey = new Map();
    for (const ref of refs)
        byKey.set(`${ref.runId}:${ref.artifactId}`, ref);
    return [...byKey.values()];
}
function workItemIdFor(needArtifact, capability, generation) {
    return hashCanonicalJson({
        runId: needArtifact.runId,
        needArtifactId: needArtifact.artifactId,
        capability,
        generation,
    }).slice(0, 32);
}
export function materializeWorkflowNeeds(dependencies, run, artifacts, now) {
    const current = currentWorkflowArtifactIds(artifacts, dependencies.inputBundles.list(run.runId));
    for (const artifact of artifacts) {
        if (artifact.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need || !current.has(artifact.artifactId))
            continue;
        const need = parseWorkflowNeedPayload(artifact.payload);
        const workItems = dependencies.workItems.list(run.runId);
        const context = { run, needArtifact: artifact, need, artifacts, workItems };
        const materialization = dependencies.policy.materializeNeed(context);
        if (materialization.kind === "pending_action") {
            dependencies.pendingActions.ensure(run, artifact, need, materialization.actionType);
            continue;
        }
        const capability = routeWorkflowCapability(run, need, dependencies.capabilities, materialization.capability);
        const existing = workItems.filter((item) => item.needArtifact.artifactId === artifact.artifactId);
        if (existing.some((item) => !["CANCELLED", "FENCED"].includes(item.state)))
            continue;
        const at = new Date(now()).toISOString();
        dependencies.workItems.create({
            schema: WORKFLOW_WORK_ITEM_SCHEMA,
            version: 1,
            revision: 1,
            workItemId: workItemIdFor(artifact, capability, existing.length + 1),
            runId: run.runId,
            needArtifact: { runId: run.runId, artifactId: artifact.artifactId },
            needId: need.needId,
            requestOwner: need.requestOwner,
            capability: { id: capability.id, version: capability.version },
            sideEffect: capability.sideEffect,
            state: "PENDING",
            authorityRef: materialization.authorityRef,
            budgetRef: materialization.budgetRef,
            executionIds: [],
            resultArtifactIds: [],
            receiptIds: [],
            createdAt: at,
            updatedAt: at,
        });
    }
}
export function prepareWorkflowReadyWork(dependencies, run, artifacts, now) {
    for (const item of dependencies.workItems.list(run.runId)) {
        if (item.state !== "PENDING")
            continue;
        const needArtifact = dependencies.artifacts.get(item.needArtifact.runId, item.needArtifact.artifactId);
        if (needArtifact === undefined)
            throw new Error(`workflow Need artifact ${item.needArtifact.artifactId} does not exist`);
        const need = parseWorkflowNeedPayload(needArtifact.payload);
        const context = {
            run,
            needArtifact,
            need,
            artifacts,
            workItems: dependencies.workItems.list(run.runId),
        };
        const readiness = dependencies.policy.readiness(context, item);
        if (readiness.ready && readiness.blockers.length > 0)
            throw new Error("workflow readiness cannot be ready with blockers");
        if (!readiness.ready)
            continue;
        const refs = uniqueArtifactRefs([item.needArtifact, ...readiness.artifacts]);
        for (const ref of refs) {
            if (dependencies.artifacts.get(ref.runId, ref.artifactId) === undefined)
                throw new Error(`workflow readiness references missing artifact ${ref.runId}:${ref.artifactId}`);
        }
        const bundle = dependencies.inputBundles.create({
            runId: run.runId,
            workItemId: item.workItemId,
            capability: item.capability,
            projection: run.definitions.projection,
            artifacts: refs,
            facts: readiness.facts,
        });
        dependencies.workItems.update(run.runId, item.workItemId, item.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            state: "READY",
            inputBundleId: bundle.bundleId,
            updatedAt: new Date(now()).toISOString(),
        }));
    }
}
//# sourceMappingURL=scheduler.js.map