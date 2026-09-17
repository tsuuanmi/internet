import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { AcceptedAdmissionSpec, AdmissionActivationTarget } from "#internet/workflow/admission/types";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";

export interface SoftwareWorkflowActivationEngine {
	start(input: StartWorkflowInput): WorkflowJob;
}

export interface SoftwareWorkflowActivationDriver {
	enqueue(jobId: string): void;
}

function activationInput(spec: AcceptedAdmissionSpec, ownerSessionId: string): StartWorkflowInput {
	if (spec.profile.id !== "software_change") {
		throw new Error(`software workflow activator does not support profile ${spec.profile.id}`);
	}
	const repository = spec.draft.target?.repository?.value;
	const baseRevision = spec.draft.target?.baseRevision?.value;
	if (repository === undefined || baseRevision === undefined) {
		throw new Error("accepted software admission is missing repository identity");
	}
	if (spec.draft.authority?.repositoryMutation?.value !== true) {
		throw new Error("accepted software admission does not authorize repository mutation");
	}
	return {
		jobId: spec.admissionId,
		objective: spec.draft.source.rawText.trim(),
		repository,
		baseRevision,
		ownerSessionId,
	};
}

function assertMatchingJob(job: WorkflowJob, expected: StartWorkflowInput): void {
	if (
		job.jobId !== expected.jobId ||
		job.objective !== expected.objective ||
		job.repository !== expected.repository ||
		job.baseRevision !== expected.baseRevision ||
		job.ownerSessionId !== expected.ownerSessionId
	) {
		throw new Error(`workflow job ${job.jobId} conflicts with accepted admission identity`);
	}
}

export function createSoftwareWorkflowActivator(
	engine: SoftwareWorkflowActivationEngine,
	driver: SoftwareWorkflowActivationDriver,
	jobs: WorkflowJobStore,
	ownerSessionId: string,
): WorkflowAdmissionActivator {
	return {
		target(spec): AdmissionActivationTarget {
			if (spec.profile.id !== "software_change") {
				throw new Error(`software workflow activator does not support profile ${spec.profile.id}`);
			}
			return { targetKind: "workflow_job", targetId: spec.admissionId };
		},
		ensure(spec, target) {
			if (target.targetKind !== "workflow_job" || target.targetId !== spec.admissionId) {
				throw new Error("software workflow activation target does not match accepted admission identity");
			}
			const expected = activationInput(spec, ownerSessionId);
			const existing = jobs.get(target.targetId);
			const job = existing ?? engine.start(expected);
			if (existing !== undefined) assertMatchingJob(existing, expected);
			driver.enqueue(job.jobId);
		},
	};
}
