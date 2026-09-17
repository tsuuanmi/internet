import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type {
	AdmissionConfirmationInput,
	WorkflowAdmissionDraftInput,
	WorkflowAdmissionRecord,
} from "#internet/workflow/admission/types";
import {
	assertWorkflowPrincipal,
	requireWorkflowOwnerSessionId,
	type WorkflowAuthorizationContext,
} from "#internet/workflow/authorization";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { createSoftwareWorkflowActivator } from "#internet/workflow/profiles/software-activation";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
import { workflowJobIsTerminal } from "#internet/workflow/types";

export interface WorkflowServiceEngine {
	start(input: StartWorkflowInput): WorkflowJob;
	continue(jobId: string): WorkflowJob;
}

export interface WorkflowServiceDriver {
	enqueue(jobId: string): void;
	cancel(jobId: string): Promise<WorkflowJob>;
	isActive(jobId: string): boolean;
}

export class WorkflowServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowServiceError";
	}
}

function preflightFailure(record: WorkflowAdmissionRecord): WorkflowServiceError {
	const preview = record.preview;
	const reasons = [...(preview?.errors ?? []), ...(preview?.unresolved.map((field) => `unresolved ${field}`) ?? [])];
	return new WorkflowServiceError(
		`workflow admission ${record.admissionId} cannot activate: ${reasons.join("; ") || "preflight did not accept the request"}`,
	);
}

export class WorkflowService {
	constructor(
		private readonly engine: WorkflowServiceEngine,
		private readonly driver: WorkflowServiceDriver,
		private readonly jobs: WorkflowJobStore,
		private readonly retention: WorkflowRetentionManager,
		private readonly admissionsStore: WorkflowAdmissionService,
	) {}

	admit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		const created = this.admissionsStore.create(context.principal, input);
		return this.admissionsStore.preflight(context.principal, created.admissionId, created.revision);
	}

	admission(context: WorkflowAuthorizationContext, admissionId: string): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		const record = this.admissionsStore.get(context.principal, admissionId);
		if (record === undefined) throw new WorkflowServiceError(`workflow admission ${admissionId} does not exist`);
		return record;
	}

	admissions(context: WorkflowAuthorizationContext): readonly WorkflowAdmissionRecord[] {
		assertWorkflowPrincipal(context.principal);
		return this.admissionsStore.list(context.principal);
	}

	confirmAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedRevision: number,
		input: AdmissionConfirmationInput,
	): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		return this.admissionsStore.confirm(context.principal, admissionId, expectedRevision, input);
	}

	start(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob {
		const admitted = this.admit(context, input);
		if (admitted.state === "PREFLIGHTED") throw preflightFailure(admitted);
		if (admitted.state === "AWAITING_CONFIRMATION") {
			throw new WorkflowServiceError(
				`workflow admission ${admitted.admissionId} requires ${admitted.preview?.confirmation.level ?? "confirmation"} before activation`,
			);
		}
		if (admitted.state !== "ACCEPTED" || admitted.acceptedSpecHash === undefined) {
			throw new WorkflowServiceError(`workflow admission ${admitted.admissionId} did not reach accepted state`);
		}
		return this.activateAdmission(context, admitted.admissionId, admitted.acceptedSpecHash);
	}

	activateAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedAcceptedSpecHash: string,
	): WorkflowJob {
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
		const activator = createSoftwareWorkflowActivator(this.engine, this.driver, this.jobs, ownerSessionId);
		const record = this.admissionsStore.activate(context.principal, admissionId, expectedAcceptedSpecHash, activator);
		if (record.activation?.targetKind !== "workflow_job") {
			throw new WorkflowServiceError(`workflow admission ${admissionId} did not activate a software workflow job`);
		}
		const job = this.jobs.get(record.activation.targetId);
		if (job === undefined) {
			throw new WorkflowServiceError(`activated workflow job ${record.activation.targetId} does not exist`);
		}
		return job;
	}

	list(context: WorkflowAuthorizationContext): readonly WorkflowJob[] {
		return this.ownerJobs(requireWorkflowOwnerSessionId(context));
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
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
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
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
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
