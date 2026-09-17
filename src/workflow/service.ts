import type { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import type { AcceptedAdmissionSpec, WorkflowAdmissionProvenance } from "#internet/workflow/admission/types";
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

export interface WorkflowStartAdmissionContext {
	readonly rawSource: string;
	readonly sourceProvenance: "user_explicit" | "local_interpreted";
	readonly targetProvenance: Extract<WorkflowAdmissionProvenance, "system_observed" | "local_interpreted">;
	readonly authorityProvenance: Extract<WorkflowAdmissionProvenance, "user_explicit" | "local_interpreted">;
}

export type StartAuthorizedWorkflowInput = Omit<StartWorkflowInput, "ownerSessionId" | "jobId"> & {
	readonly admission?: WorkflowStartAdmissionContext;
};

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

function legacyActivationInput(spec: AcceptedAdmissionSpec, ownerSessionId: string) {
	if (spec.profile.id !== "software_change") {
		throw new WorkflowServiceError(`legacy v3 activation does not support profile ${spec.profile.id}`);
	}
	const repository = spec.draft.target?.repository?.value;
	const baseRevision = spec.draft.target?.baseRevision?.value;
	if (repository === undefined || baseRevision === undefined) {
		throw new WorkflowServiceError("accepted software admission is missing repository identity");
	}
	return {
		jobId: spec.admissionId,
		objective: spec.draft.source.rawText,
		repository,
		baseRevision,
		ownerSessionId,
	};
}

function assertMatchingLegacyActivation(job: WorkflowJob, expected: StartWorkflowInput): void {
	if (
		job.jobId !== expected.jobId ||
		job.objective !== expected.objective ||
		job.repository !== expected.repository ||
		job.baseRevision !== expected.baseRevision ||
		job.ownerSessionId !== expected.ownerSessionId
	) {
		throw new WorkflowServiceError(`legacy workflow ${job.jobId} conflicts with accepted admission identity`);
	}
}

export class WorkflowService {
	private readonly engine: WorkflowServiceEngine;
	private readonly driver: WorkflowServiceDriver;
	private readonly jobs: WorkflowJobStore;
	private readonly retention: WorkflowRetentionManager;
	private readonly admissions?: WorkflowAdmissionService;

	constructor(
		engine: WorkflowServiceEngine,
		driver: WorkflowServiceDriver,
		jobs: WorkflowJobStore,
		retention: WorkflowRetentionManager,
		admissions?: WorkflowAdmissionService,
	) {
		this.engine = engine;
		this.driver = driver;
		this.jobs = jobs;
		this.retention = retention;
		this.admissions = admissions;
	}

	start(context: WorkflowAuthorizationContext, input: StartAuthorizedWorkflowInput): WorkflowJob {
		const ownerSessionId = legacyOwnerSessionId(context);
		if (this.admissions === undefined || input.admission === undefined) {
			return this.startLegacy(ownerSessionId, input);
		}

		const created = this.admissions.create(context.principal, {
			source: {
				kind: input.admission.sourceProvenance === "user_explicit" ? "user" : "local_agent",
				rawText: input.admission.rawSource,
				provenance: input.admission.sourceProvenance,
			},
			profileHint: { value: "software_change", provenance: "policy_default" },
			target: {
				repository: { value: input.repository, provenance: input.admission.targetProvenance },
				baseRevision: { value: input.baseRevision, provenance: input.admission.targetProvenance },
			},
			authority: {
				repositoryMutation: { value: true, provenance: input.admission.authorityProvenance },
			},
			autonomy: { value: "autonomous_until_external_dependency", provenance: "policy_default" },
		});
		let current = this.admissions.preflight(created.admissionId, created.revision);
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
		return this.activateLegacyAdmission(context, current.admissionId, current.revision, current.acceptedSpecHash);
	}

	activateLegacyAdmission(
		context: WorkflowAuthorizationContext,
		admissionId: string,
		expectedRevision: number,
		expectedAcceptedSpecHash: string,
	): WorkflowJob {
		const ownerSessionId = legacyOwnerSessionId(context);
		if (this.admissions === undefined) {
			throw new WorkflowServiceError("durable workflow admission is not configured");
		}
		return this.admissions.activate(
			context.principal,
			admissionId,
			expectedRevision,
			expectedAcceptedSpecHash,
			(spec) => {
				const expected = legacyActivationInput(spec, ownerSessionId);
				let job = this.jobs.get(expected.jobId!);
				if (job === undefined) {
					job = this.engine.start(expected);
				} else {
					assertMatchingLegacyActivation(job, expected);
				}
				this.driver.enqueue(job.jobId);
				return { result: job, targetKind: "legacy_v3_job", targetId: job.jobId };
			},
		).result;
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

	private startLegacy(ownerSessionId: string, input: StartAuthorizedWorkflowInput): WorkflowJob {
		const job = this.engine.start({
			objective: input.objective,
			repository: input.repository,
			baseRevision: input.baseRevision,
			ownerSessionId,
		});
		this.driver.enqueue(job.jobId);
		return job;
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
