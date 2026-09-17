import { randomBytes } from "node:crypto";
import { hashCanonicalJson } from "#internet/core/canonical-json";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import {
	WORKFLOW_WORK_ITEM_SCHEMA,
	type WorkflowArtifact,
	type WorkflowArtifactRef,
	type WorkflowRun,
	type WorkflowWorkItem,
} from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import { currentWorkflowArtifactIds, staleWorkflowWorkItems } from "#internet/workflow/runtime/invalidation";
import type { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import { routeWorkflowCapability } from "#internet/workflow/runtime/routing";
import type {
	WorkflowCapabilityExecutorRegistry,
	WorkflowExecution,
	WorkflowNeedRuntimeContext,
	WorkflowPendingActionMaterializer,
	WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/types";
import { WORKFLOW_EXECUTION_SCHEMA } from "#internet/workflow/runtime/types";
import {
	evaluateWorkflowConvergence,
	parseWorkflowNeedPayload,
	promoteWorkflowSemanticResult,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);
const TERMINAL_WORK_ITEM_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "FENCED"]);

export interface WorkflowRunCoordinatorOptions {
	readonly leaseMs?: number;
	readonly now?: () => number;
}

export interface WorkflowRunCoordinatorDependencies {
	readonly runs: WorkflowRunStore;
	readonly artifacts: WorkflowArtifactStore;
	readonly workItems: WorkflowWorkItemStore;
	readonly inputBundles: WorkflowInputBundleStore;
	readonly executions: WorkflowExecutionStore;
	readonly results: WorkflowExecutionResultStore;
	readonly capabilities: WorkflowCapabilityRegistry;
	readonly executors: WorkflowCapabilityExecutorRegistry;
	readonly pendingActions: WorkflowPendingActionMaterializer;
	readonly policy: WorkflowRuntimePolicy;
}

function uniqueArtifactRefs(refs: readonly WorkflowArtifactRef[]): readonly WorkflowArtifactRef[] {
	const byKey = new Map<string, WorkflowArtifactRef>();
	for (const ref of refs) byKey.set(`${ref.runId}:${ref.artifactId}`, ref);
	return [...byKey.values()];
}

function workItemIdFor(
	needArtifact: WorkflowArtifact,
	capability: { id: string; version: string },
	generation: number,
): string {
	return hashCanonicalJson({
		runId: needArtifact.runId,
		needArtifactId: needArtifact.artifactId,
		capability,
		generation,
	}).slice(0, 32);
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
	return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

export class WorkflowRunCoordinator {
	private readonly dependencies: WorkflowRunCoordinatorDependencies;
	private readonly leaseMs: number;
	private readonly now: () => number;

	constructor(dependencies: WorkflowRunCoordinatorDependencies, options: WorkflowRunCoordinatorOptions = {}) {
		this.dependencies = dependencies;
		this.leaseMs = options.leaseMs ?? 5 * 60_000;
		if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 1)
			throw new Error("workflow execution lease must be positive");
		this.now = options.now ?? Date.now;
	}

	status(runId: string): WorkflowRun {
		const run = this.dependencies.runs.get(runId);
		if (run === undefined) throw new Error(`workflow run ${runId} does not exist`);
		return run;
	}

	advance(runId: string): WorkflowRun {
		let run = this.status(runId);
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) return run;
		const artifacts = this.dependencies.artifacts.list(runId);
		this.invalidateStaleWork(runId, artifacts);
		this.materializeNeeds(run, artifacts);
		this.prepareReadyWork(run, artifacts);
		run = this.status(runId);
		return this.updateLifecycle(run);
	}

	runnableWorkItemIds(runId: string): readonly string[] {
		return this.dependencies.workItems
			.list(runId)
			.filter((item) => item.state === "READY")
			.map((item) => item.workItemId)
			.sort();
	}

	async reconcile(runId: string, signal?: AbortSignal): Promise<WorkflowRun> {
		const run = this.status(runId);
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) return run;
		for (const execution of this.dependencies.executions.list(runId)) {
			if (execution.state !== "RUNNING") continue;
			const storedResult = this.dependencies.results.get(runId, execution.executionId);
			if (storedResult !== undefined) {
				this.commitResult(execution, storedResult);
				continue;
			}
			if (Date.parse(execution.leaseUntil) > this.now()) continue;
			await this.reconcileExpiredExecution(execution, signal);
		}
		return this.advance(runId);
	}

	heartbeat(runId: string, executionId: string, ownerInstanceId: string): WorkflowExecution {
		const current = this.dependencies.executions.get(runId, executionId);
		if (current === undefined || current.state !== "RUNNING")
			throw new Error(`workflow execution ${executionId} is not running`);
		if (current.ownerInstanceId !== ownerInstanceId) throw new Error("workflow execution heartbeat owner mismatch");
		if (Date.parse(current.leaseUntil) <= this.now()) {
			this.fenceExecution(current, "LEASE_EXPIRED", "workflow execution lease expired before heartbeat");
			throw new Error("workflow execution lease has expired");
		}
		const at = new Date(this.now()).toISOString();
		return this.dependencies.executions.update(runId, executionId, current.revision, (value) => ({
			...value,
			revision: value.revision + 1,
			heartbeatAt: at,
			leaseUntil: new Date(this.now() + this.leaseMs).toISOString(),
		}));
	}

	async execute(
		runId: string,
		workItemId: string,
		ownerInstanceId: string,
		signal?: AbortSignal,
	): Promise<WorkflowRun> {
		const run = this.status(runId);
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) throw new Error("terminal workflow run cannot execute work");
		const item = this.dependencies.workItems.get(runId, workItemId);
		if (item === undefined) throw new Error(`workflow work item ${workItemId} does not exist`);
		if (item.state !== "READY" || item.inputBundleId === undefined)
			throw new Error(`workflow work item ${workItemId} is not ready`);
		const bundle = this.dependencies.inputBundles.get(runId, item.inputBundleId);
		if (bundle === undefined) throw new Error(`workflow InputBundle ${item.inputBundleId} does not exist`);
		const capability = this.dependencies.capabilities.resolve(item.capability);
		const executor = this.dependencies.executors.resolve(capability);
		if (!capability.executorKinds.includes(executor.kind))
			throw new Error(`workflow executor ${executor.kind} is not allowed for capability ${capability.id}`);

		const executionId = randomBytes(16).toString("hex");
		const startedAt = new Date(this.now()).toISOString();
		const execution: WorkflowExecution = {
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
		let running: WorkflowWorkItem;
		try {
			running = this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
				...current,
				revision: current.revision + 1,
				state: "RUNNING",
				executionIds: [...current.executionIds, executionId],
				updatedAt: startedAt,
			}));
		} catch (error) {
			this.fenceExecution(execution, "WORK_ITEM_CLAIM_CONFLICT", "work item claim failed");
			throw error;
		}

		try {
			const result = await executor.execute(
				{
					run,
					workItem: running,
					execution,
					inputBundle: bundle,
					heartbeat: () => this.heartbeat(runId, executionId, ownerInstanceId),
				},
				signal,
			);
			const current = this.dependencies.executions.get(runId, executionId);
			if (current === undefined || current.state !== "RUNNING") return this.advance(runId);
			if (Date.parse(current.leaseUntil) <= this.now()) {
				await this.reconcileExpiredExecution(current, signal);
				return this.advance(runId);
			}
			const stored = this.dependencies.results.create(current, result);
			this.commitResult(current, stored);
		} catch (error) {
			const current = this.dependencies.executions.get(runId, executionId);
			if (current?.state === "RUNNING") {
				if (isAbort(error, signal) && capability.sideEffect === "READ_ONLY") {
					this.fenceExecution(current, "EXECUTION_ABORTED", "read-only execution was aborted");
					this.setWorkItemReady(runId, workItemId);
				} else {
					this.failExecution(
						current,
						"EXECUTOR_FAILURE",
						error instanceof Error ? error.message : String(error),
						false,
					);
					this.setWorkItemFailed(runId, workItemId);
				}
			}
		}
		return this.advance(runId);
	}

	private materializeNeeds(run: WorkflowRun, artifacts: readonly WorkflowArtifact[]): void {
		const current = currentWorkflowArtifactIds(artifacts, this.dependencies.inputBundles.list(run.runId));
		for (const artifact of artifacts) {
			if (artifact.type !== WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need || !current.has(artifact.artifactId)) continue;
			const need = parseWorkflowNeedPayload(artifact.payload);
			const workItems = this.dependencies.workItems.list(run.runId);
			const context: WorkflowNeedRuntimeContext = { run, needArtifact: artifact, need, artifacts, workItems };
			const materialization = this.dependencies.policy.materializeNeed(context);
			if (materialization.kind === "pending_action") {
				this.dependencies.pendingActions.ensure(run, artifact, need, materialization.actionType);
				continue;
			}
			const capability = routeWorkflowCapability(
				run,
				need,
				this.dependencies.capabilities,
				materialization.capability,
			);
			const existing = workItems.filter((item) => item.needArtifact.artifactId === artifact.artifactId);
			if (existing.some((item) => !["CANCELLED", "FENCED"].includes(item.state))) continue;
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

	private prepareReadyWork(run: WorkflowRun, artifacts: readonly WorkflowArtifact[]): void {
		for (const item of this.dependencies.workItems.list(run.runId)) {
			if (item.state !== "PENDING") continue;
			const needArtifact = this.dependencies.artifacts.get(item.needArtifact.runId, item.needArtifact.artifactId);
			if (needArtifact === undefined)
				throw new Error(`workflow Need artifact ${item.needArtifact.artifactId} does not exist`);
			const need = parseWorkflowNeedPayload(needArtifact.payload);
			const context: WorkflowNeedRuntimeContext = {
				run,
				needArtifact,
				need,
				artifacts,
				workItems: this.dependencies.workItems.list(run.runId),
			};
			const readiness = this.dependencies.policy.readiness(context, item);
			if (readiness.ready && readiness.blockers.length > 0)
				throw new Error("workflow readiness cannot be ready with blockers");
			if (!readiness.ready) continue;
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

	private invalidateStaleWork(runId: string, artifacts: readonly WorkflowArtifact[]): void {
		const items = this.dependencies.workItems.list(runId);
		const bundles = this.dependencies.inputBundles.list(runId);
		for (const item of staleWorkflowWorkItems(items, bundles, artifacts)) {
			for (const execution of this.dependencies.executions.list(runId)) {
				if (execution.workItemId === item.workItemId && execution.state === "RUNNING")
					this.fenceExecution(execution, "INPUT_INVALIDATED", "execution input was invalidated");
			}
			const current = this.dependencies.workItems.get(runId, item.workItemId);
			if (current === undefined || ["CANCELLED", "FENCED"].includes(current.state)) continue;
			this.dependencies.workItems.update(runId, item.workItemId, current.revision, (value) => ({
				...value,
				revision: value.revision + 1,
				state: "FENCED",
				updatedAt: new Date(this.now()).toISOString(),
			}));
		}
	}

	private updateLifecycle(run: WorkflowRun): WorkflowRun {
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) return run;
		const convergence = this.dependencies.policy.convergence(run);
		const result = evaluateWorkflowConvergence(convergence.policy, convergence.state);
		let lifecycle: WorkflowRun["lifecycle"];
		if (result.converged) lifecycle = "COMPLETED";
		else {
			const items = this.dependencies.workItems.list(run.runId);
			const autonomous = items.some((item) => item.state === "READY" || item.state === "RUNNING");
			const artifacts = this.dependencies.artifacts.list(run.runId);
			const currentArtifacts = currentWorkflowArtifactIds(artifacts, this.dependencies.inputBundles.list(run.runId));
			const openExternal = artifacts
				.filter(
					(artifact) =>
						artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need && currentArtifacts.has(artifact.artifactId),
				)
				.some((artifact) => this.dependencies.pendingActions.hasOpen(run.runId, artifact.artifactId));
			lifecycle = autonomous ? "ACTIVE" : openExternal ? "WAITING_EXTERNAL" : "BLOCKED";
		}
		if (lifecycle === run.lifecycle) return run;
		return this.dependencies.runs.update(run.runId, run.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			lifecycle,
			updatedAt: new Date(this.now()).toISOString(),
		}));
	}

	private commitResult(execution: WorkflowExecution, result: WorkflowSemanticExecutionResult): void {
		const item = this.dependencies.workItems.get(execution.runId, execution.workItemId);
		if (item === undefined || item.inputBundleId !== execution.inputBundleId)
			throw new Error("workflow execution WorkItem binding is stale");
		if (item.state === "FENCED" || item.state === "CANCELLED")
			throw new Error("fenced workflow execution cannot commit results");
		const bundle = this.dependencies.inputBundles.get(execution.runId, execution.inputBundleId);
		if (bundle === undefined) throw new Error(`workflow InputBundle ${execution.inputBundleId} does not exist`);
		const capability = this.dependencies.capabilities.resolve(execution.capability);
		const promoted = promoteWorkflowSemanticResult(
			{ workItem: item, inputBundle: bundle, capability, artifactStore: this.dependencies.artifacts },
			result,
		);
		const currentItem = this.dependencies.workItems.get(execution.runId, execution.workItemId);
		if (currentItem === undefined) throw new Error("workflow WorkItem disappeared during result commit");
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
			this.dependencies.executions.update(
				execution.runId,
				execution.executionId,
				currentExecution.revision,
				(current) => ({ ...current, revision: current.revision + 1, state: "SUCCEEDED", finishedAt: at }),
			);
		}
	}

	private async reconcileExpiredExecution(execution: WorkflowExecution, signal?: AbortSignal): Promise<void> {
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
			this.failExecution(
				execution,
				"UNCERTAIN_EXTERNAL_MUTATION",
				"mutation execution lease expired without a reconciliation contract",
				false,
			);
			this.setWorkItemFailed(execution.runId, execution.workItemId);
			return;
		}
		const result = await executor.reconcile(
			{ run: this.status(execution.runId), workItem: item, execution, inputBundle: bundle },
			signal,
		);
		if (result === undefined) {
			this.fenceExecution(
				execution,
				"RECONCILED_ABSENT",
				"external mutation was not observed during reconciliation",
			);
			this.setWorkItemReady(execution.runId, execution.workItemId);
			return;
		}
		const stored = this.dependencies.results.create(execution, result);
		this.commitResult(execution, stored);
	}

	private fenceExecution(execution: WorkflowExecution, code: string, message: string): void {
		const current = this.dependencies.executions.get(execution.runId, execution.executionId);
		if (current === undefined || current.state !== "RUNNING") return;
		const at = new Date(this.now()).toISOString();
		this.dependencies.executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
			...value,
			revision: value.revision + 1,
			state: "FENCED",
			finishedAt: at,
			failure: { code, message, retryable: true },
		}));
	}

	private failExecution(execution: WorkflowExecution, code: string, message: string, retryable: boolean): void {
		const current = this.dependencies.executions.get(execution.runId, execution.executionId);
		if (current === undefined || current.state !== "RUNNING") return;
		const at = new Date(this.now()).toISOString();
		this.dependencies.executions.update(execution.runId, execution.executionId, current.revision, (value) => ({
			...value,
			revision: value.revision + 1,
			state: "FAILED",
			finishedAt: at,
			failure: { code, message, retryable },
		}));
	}

	private setWorkItemReady(runId: string, workItemId: string): void {
		const item = this.dependencies.workItems.get(runId, workItemId);
		if (item === undefined || TERMINAL_WORK_ITEM_STATES.has(item.state)) return;
		this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "READY",
			updatedAt: new Date(this.now()).toISOString(),
		}));
	}

	private setWorkItemFailed(runId: string, workItemId: string): void {
		const item = this.dependencies.workItems.get(runId, workItemId);
		if (item === undefined || TERMINAL_WORK_ITEM_STATES.has(item.state)) return;
		this.dependencies.workItems.update(runId, workItemId, item.revision, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "FAILED",
			updatedAt: new Date(this.now()).toISOString(),
		}));
	}
}
