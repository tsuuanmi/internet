import { randomBytes } from "node:crypto";
import { hashCanonicalJson } from "#internet/core/canonical-json";
import { WORKFLOW_WORK_ITEM_SCHEMA, } from "#internet/workflow/kernel/types";
import { currentWorkflowArtifactIds, staleWorkflowWorkItems } from "#internet/workflow/runtime/invalidation";
import { WORKFLOW_EXECUTION_SCHEMA } from "#internet/workflow/runtime/types";
import { evaluateWorkflowConvergence, parseWorkflowNeedPayload, promoteWorkflowSemanticResult, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/index";
const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);
const TERMINAL_WORK_ITEM_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "FENCED"]);
function sameRef(left, right) {
    return left.id === right.id && left.version === right.version;
}
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
function isAbort(error, signal) {
    return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}
export class WorkflowRunCoordinator {
    constructor(dependencies, options = {}) {
        this.dependencies = dependencies;
        this.leaseMs = options.leaseMs ?? 5 * 60_000;
        if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 1)
            throw new Error("workflow execution lease must be positive");
        this.now = options.now ?? Date.now;
    }
    status(runId) {
        const run = this.dependencies.runs.get(runId);
        if (run === undefined)
            throw new Error(`workflow run ${runId} does not exist`);
        return run;
    }
    advance(runId) {
        let run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            return run;
        const artifacts = this.dependencies.artifacts.list(runId);
        this.invalidateStaleWork(runId, artifacts);
        this.materializeNeeds(run, artifacts);
        this.prepareReadyWork(run, artifacts);
        run = this.status(runId);
        return this.updateLifecycle(run);
    }
    runnableWorkItemIds(runId) {
        return this.dependencies.workItems
            .list(runId)
            .filter((item) => item.state === "READY")
            .map((item) => item.workItemId)
            .sort();
    }
    async reconcile(runId, signal) {
        const run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            return run;
        for (const execution of this.dependencies.executions.list(runId)) {
            if (execution.state !== "RUNNING")
                continue;
            const storedResult = this.dependencies.results.get(runId, execution.executionId);
            if (storedResult !== undefined) {
                this.commitResult(execution, storedResult);
                continue;
            }
            if (Date.parse(execution.leaseUntil) > this.now())
                continue;
            await this.reconcileExpiredExecution(execution, signal);
        }
        return this.advance(runId);
    }
    async execute(runId, workItemId, ownerInstanceId, signal) {
        const run = this.status(runId);
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            throw new Error("terminal workflow run cannot execute work");
        const item = this.dependencies.workItems.get(runId, workItemId);
        if (item === undefined)
            throw new Error(`workflow work item ${workItemId} does not exist`);
        if (item.state !== "READY" || item.inputBundleId === undefined)
            throw new Error(`workflow work item ${workItemId} is not ready`);
        const bundle = this.dependencies.inputBundles.get(runId, item.inputBundleId);
        if (bundle === undefined)
            throw new Error(`workflow InputBundle ${item.inputBundleId} does not exist`);
        const capability = this.dependencies.capabilities.resolve(item.capability);
        const executor = this.dependencies.executors.resolve(capability);
        if (!capability.executorKinds.includes(executor.kind))
            throw new Error(`workflow executor ${executor.kind} is not allowed for capability ${capability.id}`);
        const executionId = randomBytes(16).toString("hex");
        const startedAt = new Date(this.now()).toISOString();
        const execution = {
            schema: WORKFLOW_EXECUTION_SCHEMA,
            version: 1,
            revision: 1,
            executionId,
            runId,
            workItemId,
            inputBundleId: bundle.bundleId,
            capability: item.capability,
            attempt: item.executionIds.length + 1,
            ownerInstanceId,
            state: "RUNNING",
            startedAt,
            heartbeatAt: startedAt,
            leaseUntil: new Date(this.now() + this.leaseMs).toISOString(),
        };
        this.dependencies.executions.create(execution);
        let running;
        try {
            running = this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "RUNNING",
                executionIds: [...current.executionIds, executionId],
                updatedAt: startedAt,
            }));
        }
        catch (error) {
            this.fenceExecution(execution, "WORK_ITEM_CLAIM_CONFLICT", "work item claim failed");
            throw error;
        }
        try {
            const result = await executor.execute({ run, workItem: running, execution, inputBundle: bundle }, signal);
            const current = this.dependencies.executions.get(runId, executionId);
            if (current === undefined || current.state !== "RUNNING" || Date.parse(current.leaseUntil) <= this.now())
                throw new Error("workflow execution lost its lease before result persistence");
            const stored = this.dependencies.results.create(current, result);
            this.commitResult(current, stored);
        }
        catch (error) {
            const current = this.dependencies.executions.get(runId, executionId);
            if (current?.state === "RUNNING") {
                if (isAbort(error, signal) && capability.sideEffect === "READ_ONLY") {
                    this.fenceExecution(current, "EXECUTION_ABORTED", "read-only execution was aborted");
                    this.setWorkItemReady(runId, workItemId);
                }
                else {
                    this.failExecution(current, "EXECUTOR_FAILURE", error instanceof Error ? error.message : String(error), false);
                    this.setWorkItemFailed(runId, workItemId);
                }
            }
        }
        return this.advance(runId);
    }
    materializeNeeds(run, artifacts) {
        const current = currentWorkflowArtifactIds(artifacts);
        for (const artifact of artifacts) {
            if (artifact.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need || !current.has(artifact.artifactId))
                continue;
            const need = parseWorkflowNeedPayload(artifact.payload);
            const workItems = this.dependencies.workItems.list(run.runId);
            const context = { run, needArtifact: artifact, need, artifacts, workItems };
            const materialization = this.dependencies.policy.materializeNeed(context);
            if (materialization.kind === "pending_action") {
                this.dependencies.pendingActions.ensure(run, artifact, need, materialization.actionType);
                continue;
            }
            const capability = this.dependencies.capabilities.resolve(materialization.capability);
            if (!run.definitions.capabilities.some((ref) => sameRef(ref, capability)))
                throw new Error(`workflow capability ${capability.id}@${capability.version} is not pinned by run ${run.runId}`);
            if (!capability.acceptedNeedTypes.includes(need.type))
                throw new Error(`workflow capability ${capability.id} does not accept Need type ${need.type}`);
            const existing = workItems.filter((item) => item.needArtifact.artifactId === artifact.artifactId);
            if (existing.some((item) => !["CANCELLED", "FENCED"].includes(item.state)))
                continue;
            const generation = existing.length + 1;
            const at = new Date(this.now()).toISOString();
            this.dependencies.workItems.create({
                schema: WORKFLOW_WORK_ITEM_SCHEMA,
                version: 1,
                revision: 1,
                workItemId: workItemIdFor(artifact, capability, generation),
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
    prepareReadyWork(run, artifacts) {
        for (const item of this.dependencies.workItems.list(run.runId)) {
            if (item.state !== "PENDING")
                continue;
            const needArtifact = this.dependencies.artifacts.get(item.needArtifact.runId, item.needArtifact.artifactId);
            if (needArtifact === undefined)
                throw new Error(`workflow Need artifact ${item.needArtifact.artifactId} does not exist`);
            const need = parseWorkflowNeedPayload(needArtifact.payload);
            const context = {
                run,
                needArtifact,
                need,
                artifacts,
                workItems: this.dependencies.workItems.list(run.runId),
            };
            const readiness = this.dependencies.policy.readiness(context, item);
            if (readiness.ready && readiness.blockers.length > 0)
                throw new Error("workflow readiness cannot be ready with blockers");
            if (!readiness.ready)
                continue;
            const refs = uniqueArtifactRefs([item.needArtifact, ...readiness.artifacts]);
            for (const ref of refs) {
                if (this.dependencies.artifacts.get(ref.runId, ref.artifactId) === undefined)
                    throw new Error(`workflow readiness references missing artifact ${ref.runId}:${ref.artifactId}`);
            }
            const bundle = this.dependencies.inputBundles.create({
                runId: run.runId,
                workItemId: item.workItemId,
                capability: item.capability,
                projection: run.definitions.projection,
                artifacts: refs,
                facts: readiness.facts,
            });
            const at = new Date(this.now()).toISOString();
            this.dependencies.workItems.update(run.runId, item.workItemId, item.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "READY",
                inputBundleId: bundle.bundleId,
                updatedAt: at,
            }));
        }
    }
    invalidateStaleWork(runId, artifacts) {
        const items = this.dependencies.workItems.list(runId);
        const bundles = this.dependencies.inputBundles.list(runId);
        for (const item of staleWorkflowWorkItems(items, bundles, artifacts)) {
            for (const execution of this.dependencies.executions.list(runId)) {
                if (execution.workItemId === item.workItemId && execution.state === "RUNNING")
                    this.fenceExecution(execution, "INPUT_INVALIDATED", "execution input was invalidated");
            }
            const current = this.dependencies.workItems.get(runId, item.workItemId);
            if (current === undefined || ["CANCELLED", "FENCED"].includes(current.state))
                continue;
            this.dependencies.workItems.update(runId, item.workItemId, current.revision, (value) => ({
                ...value,
                revision: value.revision + 1,
                state: "FENCED",
                updatedAt: new Date(this.now()).toISOString(),
            }));
        }
    }
    updateLifecycle(run) {
        if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle))
            return run;
        const convergence = this.dependencies.policy.convergence(run);
        const result = evaluateWorkflowConvergence(convergence.policy, convergence.state);
        let lifecycle;
        if (result.converged)
            lifecycle = "COMPLETED";
        else {
            const items = this.dependencies.workItems.list(run.runId);
            const autonomous = items.some((item) => item.state === "READY" || item.state === "RUNNING");
            const artifacts = this.dependencies.artifacts.list(run.runId);
            const currentArtifacts = currentWorkflowArtifactIds(artifacts);
            const openExternal = artifacts
                .filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need && currentArtifacts.has(artifact.artifactId))
                .some((artifact) => this.dependencies.pendingActions.hasOpen(run.runId, artifact.artifactId));
            lifecycle = autonomous ? "ACTIVE" : openExternal ? "WAITING_EXTERNAL" : "BLOCKED";
        }
        if (lifecycle === run.lifecycle)
            return run;
        return this.dependencies.runs.update(run.runId, run.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            lifecycle,
            updatedAt: new Date(this.now()).toISOString(),
        }));
    }
    commitResult(execution, result) {
        const item = this.dependencies.workItems.get(execution.runId, execution.workItemId);
        if (item === undefined || item.inputBundleId !== execution.inputBundleId)
            throw new Error("workflow execution WorkItem binding is stale");
        if (item.state === "FENCED" || item.state === "CANCELLED")
            throw new Error("fenced workflow execution cannot commit results");
        const bundle = this.dependencies.inputBundles.get(execution.runId, execution.inputBundleId);
        if (bundle === undefined)
            throw new Error(`workflow InputBundle ${execution.inputBundleId} does not exist`);
        const capability = this.dependencies.capabilities.resolve(execution.capability);
        const promoted = promoteWorkflowSemanticResult({ workItem: item, inputBundle: bundle, capability, artifactStore: this.dependencies.artifacts }, result);
        const currentItem = this.dependencies.workItems.get(execution.runId, execution.workItemId);
        if (currentItem === undefined)
            throw new Error("workflow WorkItem disappeared during result commit");
        if (currentItem.state !== "SUCCEEDED") {
            this.dependencies.workItems.update(execution.runId, execution.workItemId, currentItem.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "SUCCEEDED",
                resultArtifactIds: [
                    ...current.resultArtifactIds,
                    ...promoted.artifacts
                        .map((artifact) => artifact.artifactId)
                        .filter((id) => !current.resultArtifactIds.includes(id)),
                ],
                receiptIds: [
                    ...current.receiptIds,
                    ...promoted.receiptIds.filter((id) => !current.receiptIds.includes(id)),
                ],
                updatedAt: new Date(this.now()).toISOString(),
            }));
        }
        const currentExecution = this.dependencies.executions.get(execution.runId, execution.executionId);
        if (currentExecution?.state === "RUNNING") {
            const at = new Date(this.now()).toISOString();
            this.dependencies.executions.update(execution.runId, execution.executionId, currentExecution.revision, (current) => ({ ...current, revision: current.revision + 1, state: "SUCCEEDED", finishedAt: at }));
        }
    }
    async reconcileExpiredExecution(execution, signal) {
        const item = this.dependencies.workItems.get(execution.runId, execution.workItemId);
        const bundle = this.dependencies.inputBundles.get(execution.runId, execution.inputBundleId);
        if (item === undefined || bundle === undefined) {
            this.failExecution(execution, "MISSING_EXECUTION_CONTEXT", "execution context is missing", false);
            return;
        }
        const capability = this.dependencies.capabilities.resolve(execution.capability);
        if (capability.sideEffect === "READ_ONLY") {
            this.fenceExecution(execution, "LEASE_EXPIRED", "read-only execution lease expired");
            this.setWorkItemReady(execution.runId, execution.workItemId);
            return;
        }
        const executor = this.dependencies.executors.resolve(capability);
        if (executor.reconcile === undefined) {
            this.failExecution(execution, "UNCERTAIN_EXTERNAL_MUTATION", "mutation execution lease expired without a reconciliation contract", false);
            this.setWorkItemFailed(execution.runId, execution.workItemId);
            return;
        }
        const result = await executor.reconcile({ run: this.status(execution.runId), workItem: item, execution, inputBundle: bundle }, signal);
        if (result === undefined) {
            this.fenceExecution(execution, "RECONCILED_ABSENT", "external mutation was not observed during reconciliation");
            this.setWorkItemReady(execution.runId, execution.workItemId);
            return;
        }
        const stored = this.dependencies.results.create(execution, result);
        this.commitResult(execution, stored);
    }
    fenceExecution(execution, code, message) {
        const current = this.dependencies.executions.get(execution.runId, execution.executionId);
        if (current === undefined || current.state !== "RUNNING")
            return;
        const at = new Date(this.now()).toISOString();
        this.dependencies.executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
            ...value,
            revision: value.revision + 1,
            state: "FENCED",
            finishedAt: at,
            failure: { code, message, retryable: true },
        }));
    }
    failExecution(execution, code, message, retryable) {
        const current = this.dependencies.executions.get(execution.runId, execution.executionId);
        if (current === undefined || current.state !== "RUNNING")
            return;
        const at = new Date(this.now()).toISOString();
        this.dependencies.executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
            ...value,
            revision: value.revision + 1,
            state: "FAILED",
            finishedAt: at,
            failure: { code, message, retryable },
        }));
    }
    setWorkItemReady(runId, workItemId) {
        const item = this.dependencies.workItems.get(runId, workItemId);
        if (item === undefined || TERMINAL_WORK_ITEM_STATES.has(item.state))
            return;
        this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            state: "READY",
            updatedAt: new Date(this.now()).toISOString(),
        }));
    }
    setWorkItemFailed(runId, workItemId) {
        const item = this.dependencies.workItems.get(runId, workItemId);
        if (item === undefined || TERMINAL_WORK_ITEM_STATES.has(item.state))
            return;
        this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            state: "FAILED",
            updatedAt: new Date(this.now()).toISOString(),
        }));
    }
}
//# sourceMappingURL=coordinator.js.map