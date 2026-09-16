import type { WorkflowDriver } from "#internet/workflow/driver";
import type { WorkflowEngine } from "#internet/workflow/engine";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
import { workflowJobIsTerminal } from "#internet/workflow/types";

export type WorkflowPrincipalKind = "session" | "user" | "service";

export interface WorkflowPrincipal {
	readonly kind: WorkflowPrincipalKind;
	readonly id: string;
}

export interface WorkflowAuthorizationContext {
	readonly principal: WorkflowPrincipal;
	readonly legacyOwnerSessionId?: string;
}

export interface WorkflowServiceEngine {
	start(input: StartWorkflowInput): WorkflowJob;
	continue(jobId: string): WorkflowJob;
}

export interface WorkflowServiceDriver {
	enqueue(jobId: string): void;
	cancel(jobId: string): Promise<WorkflowJob>;
	isActive(jobId: string): boolean;
}

export type StartAuthorizedWorkflowInput = Omit<StartWorkflowInput, "ownerSessionId">;

export class WorkflowServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowServiceError";
	}
}

export function workflowSessionAuthorizationContext(sessionId: string): WorkflowAuthorizationContext {
	if (sessionId.trim() === "") throw new WorkflowServiceError("workflow session principal id is required");
	return {
		principal: { kind: "session", id: sessionId },
		legacyOwnerSessionId: sessionId,
	};
}

function legacyOwnerSessionId(context: WorkflowAuthorizationContext): string {
	if (context.principal.id.trim() === "") throw new WorkflowServiceError("workflow principal id is required");
	const ownerSessionId = context.legacyOwnerSessionId;
	if (ownerSessionId === undefined || ownerSessionId.trim() === "") {
		throw new WorkflowServiceError("legacy workflow operation requires an owner session binding");
	}
	return ownerSessionId;
}

export class WorkflowService {
	private readonly engine: WorkflowServiceEngine;
	private readonly driver: WorkflowServiceDriver;
	private readonly jobs: WorkflowJobStore;
	private readonly retention: WorkflowRetentionManager;

	constructor(
		engine: WorkflowServiceEngine,
		driver: WorkflowServiceDriver,
		jobs: WorkflowJobStore,
		retention: WorkflowRetentionManager,
	) {
		this.engine = engine;
		this.driver = driver;
		this.jobs = jobs;
		this.retention = retention;
	}

	start(context: WorkflowAuthorizationContext, input: StartAuthorizedWorkflowInput): WorkflowJob {
		const ownerSessionId = legacyOwnerSessionId(context);
		const job = this.engine.start({ ...input, ownerSessionId });
		this.driver.enqueue(job.jobId);
		return job;
	}

	list(context: WorkflowAuthorizationContext): readonly WorkflowJob[] {
		const ownerSessionId = legacyOwnerSessionId(context);
		return this.ownerJobs(ownerSessionId);
	}

	status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob {
		return this.selectJob(context, jobId, false);
	}

	async cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob> {
		const selected = this.selectJob(context, jobId, true);
		return this.driver.cancel(selected.jobId);
	}

	continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob {
		const selected = this.selectJob(context, jobId, true);
		if (this.driver.isActive(selected.jobId)) {
			throw new WorkflowServiceError(`workflow job ${selected.jobId} already has an active driver`);
		}
		if (selected.graph.lifecycle !== "BLOCKED" && selected.graph.lifecycle !== "RECOVERING") {
			throw new WorkflowServiceError(`workflow job ${selected.jobId} has no explicit recovery path`);
		}
		const resumed = this.engine.continue(selected.jobId);
		this.driver.enqueue(resumed.jobId);
		return resumed;
	}

	async delete(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowDeletionReceipt> {
		if (jobId === undefined) throw new WorkflowServiceError("/workflow delete requires an explicit jobId");
		const ownerSessionId = legacyOwnerSessionId(context);
		const selected = this.selectJob(context, jobId, false);
		const terminal = workflowJobIsTerminal(selected) ? selected : await this.driver.cancel(selected.jobId);
		return this.retention.deleteNow({
			jobId: terminal.jobId,
			expectedUpdatedAt: terminal.updatedAt,
			operatorSessionId: ownerSessionId,
		});
	}

	isActive(jobId: string): boolean {
		return this.driver.isActive(jobId);
	}

	private ownerJobs(ownerSessionId: string): readonly WorkflowJob[] {
		return this.jobs
			.list()
			.filter((job) => job.ownerSessionId === ownerSessionId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.jobId.localeCompare(b.jobId));
	}

	private selectJob(
		context: WorkflowAuthorizationContext,
		explicitJobId: string | undefined,
		requireActive: boolean,
	): WorkflowJob {
		const ownerSessionId = legacyOwnerSessionId(context);
		const owned = this.ownerJobs(ownerSessionId);
		if (explicitJobId !== undefined) {
			const job = owned.find((candidate) => candidate.jobId === explicitJobId);
			if (job === undefined) {
				throw new WorkflowServiceError(`workflow job ${explicitJobId} does not belong to this session`);
			}
			if (requireActive && workflowJobIsTerminal(job)) {
				throw new WorkflowServiceError(`workflow job ${job.jobId} is already terminal (${job.graph.lifecycle})`);
			}
			return job;
		}
		const active = owned.filter((job) => !workflowJobIsTerminal(job));
		if (active.length === 1) return active[0]!;
		if (active.length > 1) {
			throw new WorkflowServiceError(
				`multiple active workflows exist for this session; specify a jobId: ${active.map((job) => job.jobId).join(", ")}`,
			);
		}
		if (requireActive) throw new WorkflowServiceError("this session has no active workflow");
		if (owned.length === 1) return owned[0]!;
		if (owned.length === 0) throw new WorkflowServiceError("this session has no workflow jobs");
		throw new WorkflowServiceError(
			`no active workflow exists and multiple historical jobs are available; specify a jobId: ${owned.map((job) => job.jobId).join(", ")}`,
		);
	}
}
