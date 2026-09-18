import { randomBytes } from "node:crypto";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun, WorkflowWorkItem } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import {
	failWorkflowExecution,
	fenceWorkflowExecution,
	setWorkflowWorkItemFailed,
	setWorkflowWorkItemReady,
} from "#internet/workflow/runtime/execution-state";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import type { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import type { WorkflowCapabilityExecutorRegistry, WorkflowExecution } from "#internet/workflow/runtime/types";
import { WORKFLOW_EXECUTION_SCHEMA } from "#internet/workflow/runtime/types";
import { promoteWorkflowSemanticResult, type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

export interface WorkflowExecutionManagerDependencies {
	readonly runs: WorkflowRunStore;
	readonly artifacts: WorkflowArtifactStore;
	readonly workItems: WorkflowWorkItemStore;
	readonly inputBundles: WorkflowInputBundleStore;
	readonly executions: WorkflowExecutionStore;
	readonly results: WorkflowExecutionResultStore;
	readonly capabilities: WorkflowCapabilityRegistry;
	readonly executors: WorkflowCapabilityExecutorRegistry;
}

export interface WorkflowExecutionManagerOptions {
	readonly leaseMs: number;
	readonly now: () => number;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
	return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

export class WorkflowExecutionManager {
	private readonly dependencies: WorkflowExecutionManagerDependencies;
	private readonly leaseMs: number;
	private readonly now: () => number;

	constructor(dependencies: WorkflowExecutionManagerDependencies, options: WorkflowExecutionManagerOptions) {
		this.dependencies = dependencies;
		this.leaseMs = options.leaseMs;
		this.now = options.now;
	}

	heartbeat(runId: string, executionId: string, ownerInstanceId: string): WorkflowExecution {
		const current = this.dependencies.executions.get(runId, executionId);
		if (current === undefined || current.state !== "RUNNING")
			throw new Error(`workflow execution ${executionId} is not running`);
		if (current.ownerInstanceId !== ownerInstanceId) throw new Error("workflow execution heartbeat owner mismatch");
		if (Date.parse(current.leaseUntil) <= this.now()) {
			fenceWorkflowExecution(
				this.dependencies.executions,
				current,
				this.now,
				"LEASE_EXPIRED",
				"workflow execution lease expired before heartbeat",
			);
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

	async reconcile(runId: string, signal?: AbortSignal): Promise<void> {
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
	}

	async execute(run: WorkflowRun, workItemId: string, ownerInstanceId: string, signal?: AbortSignal): Promise<void> {
		const item = this.dependencies.workItems.get(run.runId, workItemId);
		if (item === undefined) throw new Error(`workflow work item ${workItemId} does not exist`);
		if (item.state !== "READY" || item.inputBundleId === undefined)
			throw new Error(`workflow work item ${workItemId} is not ready`);
		const bundle = this.dependencies.inputBundles.get(run.runId, item.inputBundleId);
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
			runId: run.runId,
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
			running = this.dependencies.workItems.update(run.runId, workItemId, item.revision, (current) => ({
				...current,
				revision: current.revision + 1,
				state: "RUNNING",
				executionIds: [...current.executionIds, executionId],
				updatedAt: startedAt,
			}));
		} catch (error) {
			fenceWorkflowExecution(
				this.dependencies.executions,
				execution,
				this.now,
				"WORK_ITEM_CLAIM_CONFLICT",
				"work item claim failed",
			);
			throw error;
		}

		try {
			const result = await executor.execute(
				{
					run,
					workItem: running,
					execution,
					inputBundle: bundle,
					heartbeat: () => this.heartbeat(run.runId, executionId, ownerInstanceId),
				},
				signal,
			);
			const current = this.dependencies.executions.get(run.runId, executionId);
			if (current === undefined || current.state !== "RUNNING") return;
			if (Date.parse(current.leaseUntil) <= this.now()) {
				await this.reconcileExpiredExecution(current, signal);
				return;
			}
			const stored = this.dependencies.results.create(current, result);
			this.commitResult(current, stored);
		} catch (error) {
			const current = this.dependencies.executions.get(run.runId, executionId);
			if (current?.state !== "RUNNING") return;
			if (isAbort(error, signal) && capability.sideEffect === "READ_ONLY") {
				fenceWorkflowExecution(
					this.dependencies.executions,
					current,
					this.now,
					"EXECUTION_ABORTED",
					"read-only execution was aborted",
				);
				setWorkflowWorkItemReady(this.dependencies.workItems, run.runId, workItemId, this.now);
				return;
			}
			failWorkflowExecution(
				this.dependencies.executions,
				current,
				this.now,
				"EXECUTOR_FAILURE",
				error instanceof Error ? error.message : String(error),
				false,
			);
			setWorkflowWorkItemFailed(this.dependencies.workItems, run.runId, workItemId, this.now);
		}
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
			{
				workItem: item,
				inputBundle: bundle,
				capability,
				artifactStore: this.dependencies.artifacts,
			},
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
		if (currentExecution?.state !== "RUNNING") return;
		const at = new Date(this.now()).toISOString();
		this.dependencies.executions.update(
			execution.runId,
			execution.executionId,
			currentExecution.revision,
			(current) => ({
				...current,
				revision: current.revision + 1,
				state: "SUCCEEDED",
				finishedAt: at,
			}),
		);
	}

	private async reconcileExpiredExecution(execution: WorkflowExecution, signal?: AbortSignal): Promise<void> {
		const item = this.dependencies.workItems.get(execution.runId, execution.workItemId);
		const bundle = this.dependencies.inputBundles.get(execution.runId, execution.inputBundleId);
		if (item === undefined || bundle === undefined) {
			failWorkflowExecution(
				this.dependencies.executions,
				execution,
				this.now,
				"MISSING_EXECUTION_CONTEXT",
				"execution context is missing",
				false,
			);
			return;
		}
		const capability = this.dependencies.capabilities.resolve(execution.capability);
		if (capability.sideEffect === "READ_ONLY") {
			fenceWorkflowExecution(
				this.dependencies.executions,
				execution,
				this.now,
				"LEASE_EXPIRED",
				"read-only execution lease expired",
			);
			setWorkflowWorkItemReady(this.dependencies.workItems, execution.runId, execution.workItemId, this.now);
			return;
		}
		const executor = this.dependencies.executors.resolve(capability);
		if (executor.reconcile === undefined) {
			failWorkflowExecution(
				this.dependencies.executions,
				execution,
				this.now,
				"UNCERTAIN_EXTERNAL_MUTATION",
				"mutation execution lease expired without a reconciliation contract",
				false,
			);
			setWorkflowWorkItemFailed(this.dependencies.workItems, execution.runId, execution.workItemId, this.now);
			return;
		}
		const run = this.dependencies.runs.get(execution.runId);
		if (run === undefined) throw new Error(`workflow run ${execution.runId} does not exist`);
		const result = await executor.reconcile({ run, workItem: item, execution, inputBundle: bundle }, signal);
		if (result === undefined) {
			fenceWorkflowExecution(
				this.dependencies.executions,
				execution,
				this.now,
				"RECONCILED_ABSENT",
				"external mutation was not observed during reconciliation",
			);
			setWorkflowWorkItemReady(this.dependencies.workItems, execution.runId, execution.workItemId, this.now);
			return;
		}
		const stored = this.dependencies.results.create(execution, result);
		this.commitResult(execution, stored);
	}
}
