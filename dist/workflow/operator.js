import { TERMINAL_WORKFLOW_STATES } from "#internet/workflow/types";
export class WorkflowOperatorError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowOperatorError";
    }
}
function ownerJobs(jobs, ownerSessionId) {
    return jobs
        .list()
        .filter((job) => job.ownerSessionId === ownerSessionId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.jobId.localeCompare(b.jobId));
}
function selectJob(jobs, ownerSessionId, explicitJobId, requireActive) {
    const owned = ownerJobs(jobs, ownerSessionId);
    if (explicitJobId !== undefined) {
        const job = owned.find((candidate) => candidate.jobId === explicitJobId);
        if (job === undefined)
            throw new WorkflowOperatorError(`workflow job ${explicitJobId} does not belong to this session`);
        if (requireActive && TERMINAL_WORKFLOW_STATES.has(job.state))
            throw new WorkflowOperatorError(`workflow job ${job.jobId} is already terminal (${job.state})`);
        return job;
    }
    const active = owned.filter((job) => !TERMINAL_WORKFLOW_STATES.has(job.state));
    if (active.length === 1)
        return active[0];
    if (active.length > 1) {
        throw new WorkflowOperatorError(`multiple active workflows exist for this session; specify a jobId: ${active.map((job) => job.jobId).join(", ")}`);
    }
    if (requireActive)
        throw new WorkflowOperatorError("this session has no active workflow");
    if (owned.length === 1)
        return owned[0];
    if (owned.length === 0)
        throw new WorkflowOperatorError("this session has no workflow jobs");
    throw new WorkflowOperatorError(`no active workflow exists and multiple historical jobs are available; specify a jobId: ${owned.map((job) => job.jobId).join(", ")}`);
}
function compact(value, max = 72) {
    const normalized = value.replace(/\s+/gu, " ").trim();
    return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}
function stageLabel(stage) {
    return stage.replaceAll("_", " ");
}
function memberLabel(job, accountId) {
    if (accountId === undefined)
        return undefined;
    const index = job.accountRouting.thinkerAccounts.indexOf(accountId);
    return index < 0 ? accountId : `Member ${index + 1}`;
}
function traceForRun(trace, phase, run) {
    return trace.filter((event) => event.phase === phase && event.lane === run.lane && event.attempt === run.attempts);
}
function latestMeaningfulEvent(events) {
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event !== undefined &&
            event.stage !== "team" &&
            event.stage !== "complete" &&
            event.stage !== "prepare_prompt") {
            return event;
        }
    }
    return events[events.length - 1];
}
function describeEvent(job, event) {
    if (event === undefined)
        return undefined;
    const member = memberLabel(job, event.accountId);
    return [
        ...(event.round === undefined ? [] : [`round ${event.round}`]),
        ...(member === undefined ? [] : [member]),
        stageLabel(event.stage),
        event.status.toUpperCase(),
        ...(event.kind === undefined ? [] : [event.kind]),
    ].join(" · ");
}
function formatMemberProgress(job, events) {
    const summaries = job.accountRouting.thinkerAccounts.map((accountId, index) => {
        const accountEvents = events.filter((event) => event.accountId === accountId && event.stage === "provider_turn");
        const latest = accountEvents[accountEvents.length - 1];
        if (latest === undefined)
            return `Member ${index + 1}=waiting`;
        const round = latest.round === undefined ? "" : ` round ${latest.round}`;
        return `Member ${index + 1}=${latest.status}${round}`;
    });
    return summaries.length === 0 ? undefined : summaries.join(" · ");
}
function formatTeam(job, phase, run, trace) {
    const events = traceForRun(trace, phase, run);
    const latest = latestMeaningfulEvent(events);
    const outputContractFailure = run.status === "failed" && latest?.status === "completed" && run.error !== undefined;
    const lines = [`Team ${run.lane} — ${run.status.toUpperCase()} (attempt ${run.attempts})`];
    if (outputContractFailure) {
        lines.push("  Step: output contract · FAILED", `  Error: output_contract`, `    ${compact(run.error, 220)}`);
        return lines;
    }
    const step = describeEvent(job, latest);
    if (step !== undefined)
        lines.push(`  Step: ${step}`);
    const members = formatMemberProgress(job, events);
    if (members !== undefined)
        lines.push(`  Members: ${members}`);
    const message = latest?.message ?? run.error;
    if (run.status === "failed" || latest?.status === "failed") {
        const kind = latest?.kind ?? "unknown_error";
        const retry = latest?.retryable === undefined ? "" : latest.retryable ? " · retryable" : " · not retryable";
        lines.push(`  Error: ${kind}${retry}`);
        if (message !== undefined && message.trim() !== "")
            lines.push(`    ${compact(message, 220)}`);
        if (latest?.accountId !== undefined || latest?.provider !== undefined) {
            lines.push(`  Diagnostic: ${latest.accountId ?? "unknown-account"} · ${latest.provider ?? "unknown-provider"}`);
        }
    }
    else if (run.status === "completed") {
        lines.push(`  Result: ${phase === "research" ? "ready for handoff" : "review result ready"}`);
    }
    return lines;
}
function laneSummary(runs) {
    return runs.map((run) => `Team ${run.lane}=${run.status}`).join(" · ");
}
function currentStep(job) {
    if (job.state === "FAILED_RETRYABLE") {
        const resume = job.pendingAction?.resumeState;
        if (resume?.startsWith("RESEARCH"))
            return "Research · retry required";
        if (resume?.startsWith("REVIEW"))
            return "Review · retry required";
        if (resume?.startsWith("WRITER"))
            return "Writer · retry required";
        return "Retry required";
    }
    if (job.state === "CREATED" || job.state.startsWith("RESEARCH"))
        return "Research";
    if (job.state.startsWith("WRITER"))
        return "Writer";
    if (job.state === "PR_OPEN" || job.state.startsWith("REVIEW"))
        return "Review";
    if (job.state === "READY_FOR_MERGE_AUTHORIZATION" || job.state === "AWAITING_MERGE_AUTHORIZATION")
        return "Merge authorization";
    if (job.state === "MERGING")
        return "Merge";
    if (job.state === "DONE")
        return "Complete";
    if (job.state === "CANCELLED")
        return "Cancelled";
    return job.state.replaceAll("_", " ").toLowerCase();
}
function writerStatus(job) {
    if (job.state === "CREATED" ||
        job.state.startsWith("RESEARCH") ||
        (job.state === "FAILED_RETRYABLE" && job.pullRequest === undefined)) {
        return "waiting for research";
    }
    if (job.state.startsWith("WRITER"))
        return "running";
    if (job.pullRequest !== undefined)
        return "implementation delivered";
    return job.state.toLowerCase();
}
export function formatWorkflowList(jobs) {
    if (jobs.length === 0)
        return "No workflow jobs for this session.";
    return [
        "JOB                               STATE                            UPDATED                   OBJECTIVE",
        ...jobs.map((job) => `${job.jobId}  ${job.state.padEnd(31)}  ${job.updatedAt.padEnd(24)}  ${compact(job.objective, 70)}`),
    ].join("\n");
}
export function formatWorkflowStatus(job, trace, active) {
    const lines = [
        `Workflow ${job.jobId}`,
        `State: ${job.state}${active ? " · driver active" : ""}`,
        `Current: ${currentStep(job)}`,
        `Objective: ${job.objective}`,
        "",
        "Pipeline",
        `  Research  ${laneSummary(job.teamRuns.research)}`,
        `  Writer    ${writerStatus(job)}`,
        `  Review    ${laneSummary(job.teamRuns.review)}`,
        `  PR        ${job.pullRequest === undefined ? "not created" : `#${job.pullRequest.number} · ${job.pullRequest.headSha.slice(0, 12)}`}`,
        "",
        "Research teams",
    ];
    for (const run of job.teamRuns.research) {
        lines.push(...formatTeam(job, "research", run, trace).map((line) => `  ${line}`));
    }
    lines.push("", "Writer", `  Account: ${job.writerConversation.accountId}`, `  Status: ${writerStatus(job)}`);
    lines.push("", "Review teams");
    for (const run of job.teamRuns.review) {
        lines.push(...formatTeam(job, "review", run, trace).map((line) => `  ${line}`));
    }
    lines.push("", "PR");
    if (job.pullRequest === undefined)
        lines.push("  not created");
    else {
        lines.push(`  ${job.pullRequest.url}`, `  base=${job.pullRequest.base} head=${job.pullRequest.head}`, `  head_sha=${job.pullRequest.headSha}`, `  review_cycle=${job.reviewCycle}`);
        if (job.ciReceipt !== undefined)
            lines.push(`  ci=${job.ciReceipt.status} checked=${job.ciReceipt.checkedAt}`);
    }
    if (job.pendingAction !== undefined) {
        lines.push("", `ACTION REQUIRED: ${job.pendingAction.kind}`, `  ${job.pendingAction.message}`);
        if (job.pendingAction.expectedHeadSha !== undefined)
            lines.push(`  expected_head=${job.pendingAction.expectedHeadSha}`);
    }
    lines.push("", `Last durable update: ${job.updatedAt}`);
    return lines.join("\n");
}
/** User-facing operations over authoritative durable workflow state. */
export class WorkflowOperator {
    constructor(engine, driver, jobs, traces, retention) {
        this.engine = engine;
        this.driver = driver;
        this.jobs = jobs;
        this.traces = traces;
        this.retention = retention;
    }
    list(ownerSessionId) {
        return formatWorkflowList(ownerJobs(this.jobs, ownerSessionId));
    }
    status(ownerSessionId, jobId) {
        const job = selectJob(this.jobs, ownerSessionId, jobId, false);
        return formatWorkflowStatus(job, this.traces.list(job.jobId), this.driver.isActive(job.jobId));
    }
    watch(ownerSessionId, jobId) {
        const job = selectJob(this.jobs, ownerSessionId, jobId, false);
        return [
            formatWorkflowStatus(job, this.traces.list(job.jobId), this.driver.isActive(job.jobId)),
            "",
            "Watching: live progress identifies phase, Team A/B, attempt, round, Member 1/2, stage, and structured failures as durable events arrive.",
        ].join("\n");
    }
    async stop(ownerSessionId, jobId) {
        const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
        const trace = this.traces.list(selected.jobId);
        const latest = latestMeaningfulEvent(trace);
        const cancelled = await this.driver.cancel(selected.jobId);
        const stoppedAt = latest === undefined ? "unknown current operation" : (describeEvent(selected, latest) ?? latest.stage);
        return `Workflow ${cancelled.jobId} cancelled.\nStopped at: ${stoppedAt}\nState: ${cancelled.state}`;
    }
    async delete(ownerSessionId, jobId) {
        if (jobId === undefined)
            throw new WorkflowOperatorError("/workflow delete requires an explicit jobId");
        const selected = selectJob(this.jobs, ownerSessionId, jobId, false);
        const terminal = TERMINAL_WORKFLOW_STATES.has(selected.state)
            ? selected
            : await this.driver.cancel(selected.jobId);
        const deleted = this.retention.deleteNow({
            jobId: terminal.jobId,
            expectedUpdatedAt: terminal.updatedAt,
            operatorSessionId: ownerSessionId,
        });
        return `Workflow ${deleted.jobId} deleted. Previous state: ${deleted.state}. Removed ${deleted.deletedHandoffFiles} handoff file(s)${deleted.deletedTrace ? " and its team trace" : ""}.`;
    }
    continue(ownerSessionId, jobId) {
        const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
        if (selected.state !== "FAILED_RETRYABLE" && selected.pendingAction?.resumeState === undefined) {
            throw new WorkflowOperatorError(`workflow job ${selected.jobId} has no explicit retry/recovery path`);
        }
        const resumed = this.engine.continue(selected.jobId);
        this.driver.enqueue(resumed.jobId);
        return `Workflow ${resumed.jobId} resumed from durable state ${resumed.state}.`;
    }
}
//# sourceMappingURL=operator.js.map