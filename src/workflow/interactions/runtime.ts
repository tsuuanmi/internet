import type { WorkflowInteractionService } from "#internet/workflow/interactions/service";
import type { WorkflowPendingActionContract } from "#internet/workflow/interactions/types";
import type { WorkflowPendingActionStore } from "#internet/workflow/pending-action-store";
import type { WorkflowPendingActionRuntime } from "#internet/workflow/runtime/types";

export class WorkflowDurablePendingActionRuntime implements WorkflowPendingActionRuntime {
	private readonly store: WorkflowPendingActionStore;
	private readonly service: WorkflowInteractionService;

	constructor(store: WorkflowPendingActionStore, service: WorkflowInteractionService) {
		this.store = store;
		this.service = service;
	}

	ensure(input: {
		readonly run: Parameters<WorkflowPendingActionStore["ensure"]>[0]["run"];
		readonly needArtifact: Parameters<WorkflowPendingActionStore["ensure"]>[0]["needArtifact"];
		readonly need: Parameters<WorkflowPendingActionStore["ensure"]>[0]["need"];
		readonly contract: WorkflowPendingActionContract;
		readonly now?: () => number;
	}) {
		return this.store.ensure(input);
	}

	list(runId: string) {
		return this.store.list(runId);
	}

	hasOpen(runId: string, needArtifactId: string): boolean {
		return this.store.hasOpen(runId, needArtifactId);
	}

	reconcile(runId: string): void {
		this.service.supersedeStale(runId);
	}
}
