import type {
	WorkflowActivationResource,
	WorkflowAdmissionActivationRegistry,
} from "#internet/workflow/admission/activation-registry";
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
	workflowPrincipalEquals,
} from "#internet/workflow/authorization";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowDeletionReceipt, WorkflowRetentionManager } from "#internet/workflow/retention";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
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

export interface WorkflowLegacyServiceRuntime {
	readonly engine: WorkflowServiceEngine;
	readonly driver: WorkflowServiceDriver;
	readonly jobs: WorkflowJobStore;
	readonly retention: WorkflowRetentionManager;
}

export interface WorkflowRunServiceDriver {
	cancel(runId: string): Promise<WorkflowRun>;
	isActive(runId: string): boolean;
}

export interface WorkflowVNextServiceRuntime {
	readonly runs: WorkflowRunStore;
	readonly driver: WorkflowRunServiceDriver;
}

export interface WorkflowServiceDependencies {
	readonly admissionService: WorkflowAdmissionService;
	readonly activationRegistry: WorkflowAdmissionActivationRegistry;
	readonly vNext?: WorkflowVNextServiceRuntime;
	readonly legacy?: WorkflowLegacyServiceRuntime;
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
	private readonly admissionService: WorkflowAdmissionService;
	private readonly activationRegistry: WorkflowAdmissionActivationRegistry;
	private readonly vNextRuntime?: WorkflowVNextServiceRuntime;
	private readonly legacyRuntime?: WorkflowLegacyServiceRuntime;

	constructor(dependencies: WorkflowServiceDependencies) {
		this.admissionService = dependencies.admissionService;
		this.activationRegistry = dependencies.activationRegistry;
		this.vNextRuntime = dependencies.vNext;
		this.legacyRuntime = dependencies.legacy;
	}

	admit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		const created = this.admissionService.create(context.principal, input);
		return this.admissionService.preflight(context.principal, created.admissionId, created.revision);
	}

	admission(context: WorkflowAuthorizationContext, admissionId: string): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		const record = this.admissionService.get(context.principal, admissionId);
		if (record === undefined) throw new WorkflowServiceError(`workflow admission ${admissionId} does not exist`);
		return record;
	}

	admissions(context: WorkflowAuthorizationContext): readonly WorkflowAdmissionRecord[] {
		assertWorkflowPrincipal(context.principal);
		return this.admissionService.list(context.principal);
	}

	confirmAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedRevision: number,
		input: AdmissionConfirmationInput,
	): WorkflowAdmissionRecord {
		assertWorkflowPrincipal(context.principal);
		return this.admissionService.confirm(context.principal, admissionId, expectedRevision, input);
	}

	autoSubmit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob {
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

	activateAdmissionTarget(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedAcceptedSpecHash: string,
	): WorkflowActivationResource {
		assertWorkflowPrincipal(context.principal);
		const admitted = this.admission(context, admissionId);
		if (admitted.acceptedSpec === undefined) {
			throw new WorkflowServiceError(`workflow admission ${admissionId} has no accepted specification`);
		}
		const handler = this.activationRegistry.resolve(admitted.acceptedSpec.profile.id);
		const record = this.admissionService.activate(
			context.principal,
			admissionId,
			expectedAcceptedSpecHash,
			handler.activator(context),
		);
		if (record.activation === undefined) {
			throw new WorkflowServiceError(`workflow admission ${admissionId} did not produce an activation target`);
		}
		return handler.resolve(record.activation);
	}

	targetStatus(context: WorkflowAuthorizationContext, targetId: string): WorkflowActivationResource {
		assertWorkflowPrincipal(context.principal);
		const run = this.vNextRuntime?.runs.get(targetId);
		if (run !== undefined) {
			if (!workflowPrincipalEquals(run.owner, context.principal)) {
				throw new WorkflowServiceError(`workflow run ${targetId} does not belong to this principal`);
			}
			return { kind: "workflow_run", run };
		}
		if (this.legacyRuntime === undefined) {
			throw new WorkflowServiceError(`workflow target ${targetId} does not exist`);
		}
		return { kind: "workflow_job", job: this.status(context, targetId) };
	}

	async cancelTarget(context: WorkflowAuthorizationContext, targetId: string): Promise<WorkflowActivationResource> {
		assertWorkflowPrincipal(context.principal);
		const run = this.vNextRuntime?.runs.get(targetId);
		if (run !== undefined) {
			if (!workflowPrincipalEquals(run.owner, context.principal)) {
				throw new WorkflowServiceError(`workflow run ${targetId} does not belong to this principal`);
			}
			return { kind: "workflow_run", run: await this.vNextRuntime!.driver.cancel(targetId) };
		}
		if (this.legacyRuntime === undefined) {
			throw new WorkflowServiceError(`workflow target ${targetId} does not exist`);
		}
		return { kind: "workflow_job", job: await this.cancel(context, targetId) };
	}

	/** v3 software compatibility surface retained until the explicit migration-retirement milestone. */
	activateAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedAcceptedSpecHash: string,
	): WorkflowJob {
		const resource = this.activateAdmissionTarget(context, admissionId, expectedAcceptedSpecHash);
		if (resource.kind !== "workflow_job") {
			throw new WorkflowServiceError(
				`workflow admission ${admissionId} activated a vNext WorkflowRun, not a v3 WorkflowJob`,
			);
		}
		return resource.job;
	}

	list(context: WorkflowAuthorizationContext): readonly WorkflowJob[] {
		return this.ownerJobs(this.legacy(), requireWorkflowOwnerSessionId(context));
	}

	status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob {
		return this.selectJob(this.legacy(), context, jobId, false);
	}

	async cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob> {
		const legacy = this.legacy();
		const selected = this.selectJob(legacy, context, jobId, true);
		return legacy.driver.cancel(selected.jobId);
	}

	continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob {
		const legacy = this.legacy();
		const selected = this.selectJob(legacy, context, jobId, true);
		if (legacy.driver.isActive(selected.jobId)) {
			throw new WorkflowServiceError(`workflow job ${selected.jobId} already has an active driver`);
		}
		if (selected.graph.lifecycle !== "BLOCKED" && selected.graph.lifecycle !== "RECOVERING") {
			throw new WorkflowServiceError(`workflow job ${selected.jobId} has no explicit recovery path`);
		}
		const resumed = legacy.engine.continue(selected.jobId);
		legacy.driver.enqueue(resumed.jobId);
		return resumed;
	}

	async delete(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowDeletionReceipt> {
		if (jobId === undefined) throw new WorkflowServiceError("/workflow delete requires an explicit jobId");
		const legacy = this.legacy();
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
		const selected = this.selectJob(legacy, context, jobId, false);
		const terminal = workflowJobIsTerminal(selected) ? selected : await legacy.driver.cancel(selected.jobId);
		return legacy.retention.deleteNow({
			jobId: terminal.jobId,
			expectedUpdatedAt: terminal.updatedAt,
			operatorSessionId: ownerSessionId,
		});
	}

	isActive(jobId: string): boolean {
		return this.legacy().driver.isActive(jobId);
	}

	private legacy(): WorkflowLegacyServiceRuntime {
		if (this.legacyRuntime === undefined) {
			throw new WorkflowServiceError("legacy software workflow runtime is not available");
		}
		return this.legacyRuntime;
	}

	private ownerJobs(legacy: WorkflowLegacyServiceRuntime, ownerSessionId: string): readonly WorkflowJob[] {
		return legacy.jobs
			.list()
			.filter((job) => job.ownerSessionId === ownerSessionId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.jobId.localeCompare(b.jobId));
	}

	private selectJob(
		legacy: WorkflowLegacyServiceRuntime,
		context: WorkflowAuthorizationContext,
		explicitJobId: string | undefined,
		requireActive: boolean,
	): WorkflowJob {
		const ownerSessionId = requireWorkflowOwnerSessionId(context);
		const owned = this.ownerJobs(legacy, ownerSessionId);
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
