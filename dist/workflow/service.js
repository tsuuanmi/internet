import { assertWorkflowPrincipal, requireWorkflowOwnerSessionId, workflowPrincipalEquals, } from "#internet/workflow/authorization";
import { workflowJobIsTerminal } from "#internet/workflow/types";
export class WorkflowServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowServiceError";
    }
}
function preflightFailure(record) {
    const preview = record.preview;
    const reasons = [...(preview?.errors ?? []), ...(preview?.unresolved.map((field) => `unresolved ${field}`) ?? [])];
    return new WorkflowServiceError(`workflow admission ${record.admissionId} cannot activate: ${reasons.join("; ") || "preflight did not accept the request"}`);
}
export class WorkflowService {
    constructor(dependencies) {
        this.admissionService = dependencies.admissionService;
        this.activationRegistry = dependencies.activationRegistry;
        this.vNextRuntime = dependencies.vNext;
        this.legacyRuntime = dependencies.legacy;
    }
    admit(context, input) {
        assertWorkflowPrincipal(context.principal);
        const created = this.admissionService.create(context.principal, input);
        return this.admissionService.preflight(context.principal, created.admissionId, created.revision);
    }
    admission(context, admissionId) {
        assertWorkflowPrincipal(context.principal);
        const record = this.admissionService.get(context.principal, admissionId);
        if (record === undefined)
            throw new WorkflowServiceError(`workflow admission ${admissionId} does not exist`);
        return record;
    }
    admissions(context) {
        assertWorkflowPrincipal(context.principal);
        return this.admissionService.list(context.principal);
    }
    confirmAdmission(context, admissionId, expectedRevision, input) {
        assertWorkflowPrincipal(context.principal);
        return this.admissionService.confirm(context.principal, admissionId, expectedRevision, input);
    }
    autoSubmit(context, input) {
        const admitted = this.admit(context, input);
        if (admitted.state === "PREFLIGHTED")
            throw preflightFailure(admitted);
        if (admitted.state === "AWAITING_CONFIRMATION") {
            throw new WorkflowServiceError(`workflow admission ${admitted.admissionId} requires ${admitted.preview?.confirmation.level ?? "confirmation"} before activation`);
        }
        if (admitted.state !== "ACCEPTED" || admitted.acceptedSpecHash === undefined) {
            throw new WorkflowServiceError(`workflow admission ${admitted.admissionId} did not reach accepted state`);
        }
        return this.activateAdmission(context, admitted.admissionId, admitted.acceptedSpecHash);
    }
    activateAdmissionTarget(context, admissionId, expectedAcceptedSpecHash) {
        assertWorkflowPrincipal(context.principal);
        const admitted = this.admission(context, admissionId);
        if (admitted.acceptedSpec === undefined) {
            throw new WorkflowServiceError(`workflow admission ${admissionId} has no accepted specification`);
        }
        const handler = this.activationRegistry.resolve(admitted.acceptedSpec.profile.id);
        const record = this.admissionService.activate(context.principal, admissionId, expectedAcceptedSpecHash, handler.activator(context));
        if (record.activation === undefined) {
            throw new WorkflowServiceError(`workflow admission ${admissionId} did not produce an activation target`);
        }
        return handler.resolve(record.activation);
    }
    targetStatus(context, targetId) {
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
    async cancelTarget(context, targetId) {
        assertWorkflowPrincipal(context.principal);
        const run = this.vNextRuntime?.runs.get(targetId);
        if (run !== undefined) {
            if (!workflowPrincipalEquals(run.owner, context.principal)) {
                throw new WorkflowServiceError(`workflow run ${targetId} does not belong to this principal`);
            }
            return { kind: "workflow_run", run: await this.vNextRuntime.driver.cancel(targetId) };
        }
        if (this.legacyRuntime === undefined) {
            throw new WorkflowServiceError(`workflow target ${targetId} does not exist`);
        }
        return { kind: "workflow_job", job: await this.cancel(context, targetId) };
    }
    /** v3 software compatibility surface retained until the explicit migration-retirement milestone. */
    activateAdmission(context, admissionId, expectedAcceptedSpecHash) {
        const resource = this.activateAdmissionTarget(context, admissionId, expectedAcceptedSpecHash);
        if (resource.kind !== "workflow_job") {
            throw new WorkflowServiceError(`workflow admission ${admissionId} activated a vNext WorkflowRun, not a v3 WorkflowJob`);
        }
        return resource.job;
    }
    list(context) {
        return this.ownerJobs(this.legacy(), requireWorkflowOwnerSessionId(context));
    }
    status(context, jobId) {
        return this.selectJob(this.legacy(), context, jobId, false);
    }
    async cancel(context, jobId) {
        const legacy = this.legacy();
        const selected = this.selectJob(legacy, context, jobId, true);
        return legacy.driver.cancel(selected.jobId);
    }
    continue(context, jobId) {
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
    async delete(context, jobId) {
        if (jobId === undefined)
            throw new WorkflowServiceError("/workflow delete requires an explicit jobId");
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
    isActive(jobId) {
        return this.legacy().driver.isActive(jobId);
    }
    legacy() {
        if (this.legacyRuntime === undefined) {
            throw new WorkflowServiceError("legacy software workflow runtime is not available");
        }
        return this.legacyRuntime;
    }
    ownerJobs(legacy, ownerSessionId) {
        return legacy.jobs
            .list()
            .filter((job) => job.ownerSessionId === ownerSessionId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.jobId.localeCompare(b.jobId));
    }
    selectJob(legacy, context, explicitJobId, requireActive) {
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
        if (active.length === 1)
            return active[0];
        if (active.length > 1) {
            throw new WorkflowServiceError(`multiple active workflows exist for this session; specify a jobId: ${active.map((job) => job.jobId).join(", ")}`);
        }
        if (requireActive)
            throw new WorkflowServiceError("this session has no active workflow");
        if (owned.length === 1)
            return owned[0];
        if (owned.length === 0)
            throw new WorkflowServiceError("this session has no workflow jobs");
        throw new WorkflowServiceError(`no active workflow exists and multiple historical jobs are available; specify a jobId: ${owned.map((job) => job.jobId).join(", ")}`);
    }
}
//# sourceMappingURL=service.js.map