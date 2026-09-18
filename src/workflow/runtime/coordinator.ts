import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import {
	WorkflowExecutionManager,
	type WorkflowExecutionManagerDependencies,
} from "#internet/workflow/runtime/execution-manager";
import type { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import { applyWorkflowInvalidation, currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import { projectWorkflowRunLifecycle } from "#internet/workflow/runtime/lifecycle";
import type { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import { materializeWorkflowNeeds, prepareWorkflowReadyWork } from "#internet/workflow/runtime/scheduler";
import type {
	WorkflowAwaitableRuntime,
	WorkflowCapabilityExecutorRegistry,
	WorkflowExecution,
	WorkflowPendingActionRuntime,
	WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/types";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);

export interface WorkflowRunCoordinatorOptions {
	readonly leaseMs?: number;
	readonly now?: () => number;
}

export interface WorkflowRunCoordinatorDependencies extends WorkflowExecutionManagerDependencies {
	readonly runs: WorkflowRunStore;
	readonly artifacts: WorkflowArtifactStore;
	readonly workItems: WorkflowWorkItemStore;
	readonly inputBundles: WorkflowInputBundleStore;
	readonly executions: WorkflowExecutionStore;
	readonly results: WorkflowExecutionResultStore;
	readonly capabilities: WorkflowCapabilityRegistry;
	readonly executors: WorkflowCapabilityExecutorRegistry;
	readonly pendingActions: WorkflowPendingActionRuntime;
	readonly awaitables: WorkflowAwaitableRuntime;
	readonly policy: WorkflowRuntimePolicy;
}

export class WorkflowRunCoordinator {
	private readonly dependencies: WorkflowRunCoordinatorDependencies;
	private readonly execution: WorkflowExecutionManager;
	private readonly now: () => number;

	constructor(dependencies: WorkflowRunCoordinatorDependencies, options: WorkflowRunCoordinatorOptions = {}) {
		const leaseMs = options.leaseMs ?? 5 * 60_000;
		if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new Error("workflow execution lease must be positive");
		this.dependencies = dependencies;
		this.now = options.now ?? Date.now;
		this.execution = new WorkflowExecutionManager(dependencies, { leaseMs, now: this.now });
	}

	status(runId: string): WorkflowRun {
		const run = this.dependencies.runs.get(runId);
		if (run === undefined) throw new Error(`workflow run ${runId} does not exist`);
		return run;
	}

	advance(runId: string): WorkflowRun {
		let run = this.status(runId);
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) return run;
		this.dependencies.pendingActions.reconcile(runId);
		const artifacts = this.dependencies.artifacts.list(runId);
		applyWorkflowInvalidation(this.dependencies, runId, artifacts, this.now);
		this.dependencies.awaitables.cancelInactive(
			runId,
			currentWorkflowArtifactIds(artifacts, this.dependencies.inputBundles.list(runId)),
			this.now,
		);
		this.dependencies.awaitables.reconcile(runId, this.now);
		materializeWorkflowNeeds(this.dependencies, run, artifacts, this.now);
		prepareWorkflowReadyWork(this.dependencies, run, artifacts, this.now);
		run = this.status(runId);
		return projectWorkflowRunLifecycle(this.dependencies, run, this.now);
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
		this.dependencies.pendingActions.reconcile(runId);
		const artifacts = this.dependencies.artifacts.list(runId);
		applyWorkflowInvalidation(this.dependencies, runId, artifacts, this.now);
		this.dependencies.awaitables.cancelInactive(
			runId,
			currentWorkflowArtifactIds(artifacts, this.dependencies.inputBundles.list(runId)),
			this.now,
		);
		this.dependencies.awaitables.reconcile(runId, this.now);
		await this.execution.reconcile(runId, signal);
		return this.advance(runId);
	}

	heartbeat(runId: string, executionId: string, ownerInstanceId: string): WorkflowExecution {
		return this.execution.heartbeat(runId, executionId, ownerInstanceId);
	}

	async execute(
		runId: string,
		workItemId: string,
		ownerInstanceId: string,
		signal?: AbortSignal,
	): Promise<WorkflowRun> {
		const run = this.status(runId);
		if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) throw new Error("terminal workflow run cannot execute work");
		await this.execution.execute(run, workItemId, ownerInstanceId, signal);
		return this.advance(runId);
	}
}
