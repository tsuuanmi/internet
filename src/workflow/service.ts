import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type { WorkflowAdmissionDraftInput } from "#internet/workflow/admission/types";
import {
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

export class WorkflowService {
	private readonly engine: WorkflowServiceEngine;
	private readonly driver: WorkflowServiceDriver;
	private readonly jobs: WorkflowJobStore;
	private readonly retention: WorkflowRetentionManager;
	private readonly admissions: WorkflowAdmissionService;

	constructor(
		engine: WorkflowServiceEngine,
		driver: WorkflowServiceDriver,
		jobs: WorkflowJobStore,
		retention: WorkflowRetentionManager,
		admissions: WorkflowAdmissionService,
	) {
		this.engine = engine;
		this.driver = driver;
		this.jobs = jobs;
		this.retention = retention;
		this.admissions = admissions;
	}

	start(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob {
		requireWorkflowOwnerSessionId(context);
		const created = this.admissions.create(context.principal, input);
		let current = this.admissions.preflight(context.principal, created.admissionId, created.revision);

		if (current.state === "PREFLIGHTED") {
			const preview = current.preview;
			const reasons = [...(preview?.errors ?? []), ...(preview?.unresolved.map((field) => `unresolved ${field}`) ?? [])];
			throw new WorkflowServiceError(
				`workflow admission ${current.admissionId} cannot activate: ${reasons.join("; ") || "preflight did not accept the request"}`,
			);
		}
		if (current.state === "AWAITING_CONFIRMATION") {
			if (current.preview?.confirmation.level !== "LOCAL_CONFIRM") {
				throw new WorkflowServiceError(
					`workflow admission ${current.admissionId} requires explicit User confirmation before activation`,
				);
			}
			current = this.admissions.confirm(context.principal, current.admissionId, current.revision, {
				expectedDraftHash: current.draftHash,
				provenance: "local_interpreted",
			});
		}
		if (current.state !== "ACCEPTED" || current.acceptedSpecHash === undefined) {
			throw new WorkflowServiceError(`workflow admission ${current.admissionId} did not reach accepted state`);
		}
		return this.activateAdmission(context, current.admissionId, current.acceptedSpecHash);
	}

	activateAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedAcceptedSpecHash: string,
	): WorkflowJob {
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
		const activator = createSoftwareWorkflowActivator(this.engine, this.driver, this.jobs, ownerSessionId);
		const record = this.admissions.activate(
			context.principal,
			admissionId,
			expectedAcceptedSpecHash,
			activator,
		);
		if (record.activation?.targetKind !== "legacy_v3_job") {
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
