import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import type {
	WorkflowPendingActionMaterializer,
	WorkflowRuntimePolicy,
} from "#internet/workflow/runtime/types";
import {
	evaluateWorkflowConvergence,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
} from "#internet/workflow/semantic/index";
import type { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";

export interface WorkflowLifecycleDependencies {
	readonly runs: WorkflowRunStore;
	readonly artifacts: WorkflowArtifactStore;
	readonly workItems: WorkflowWorkItemStore;
	readonly inputBundles: WorkflowInputBundleStore;
	readonly pendingActions: WorkflowPendingActionMaterializer;
	readonly policy: WorkflowRuntimePolicy;
}

const TERMINAL_RUN_LIFECYCLES = new Set(["COMPLETED", "CANCELLED"]);

export function projectWorkflowRunLifecycle(
	dependencies: WorkflowLifecycleDependencies,
	run: WorkflowRun,
	now: () => number,
): WorkflowRun {
	if (TERMINAL_RUN_LIFECYCLES.has(run.lifecycle)) return run;
	const convergence = dependencies.policy.convergence(run);
	const result = evaluateWorkflowConvergence(convergence.policy, convergence.state);
	let lifecycle: WorkflowRun["lifecycle"];
	if (result.converged) {
		lifecycle = "COMPLETED";
	} else {
		const autonomous = dependencies.workItems
			.list(run.runId)
			.some((item) => item.state === "READY" || item.state === "RUNNING");
		const artifacts = dependencies.artifacts.list(run.runId);
		const currentArtifacts = currentWorkflowArtifactIds(
			artifacts,
			dependencies.inputBundles.list(run.runId),
		);
		const openExternal = artifacts
			.filter(
				(artifact) =>
					artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need &&
					currentArtifacts.has(artifact.artifactId),
			)
			.some((artifact) => dependencies.pendingActions.hasOpen(run.runId, artifact.artifactId));
		lifecycle = autonomous ? "ACTIVE" : openExternal ? "WAITING_EXTERNAL" : "BLOCKED";
	}
	if (lifecycle === run.lifecycle) return run;
	return dependencies.runs.update(run.runId, run.revision, (current) => ({
		...current,
		revision: current.revision + 1,
		lifecycle,
		updatedAt: new Date(now()).toISOString(),
	}));
}
