import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowTeamTraceEvent, WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";
import { TERMINAL_WORKFLOW_STATES, type WorkflowJob, type WorkflowTeamRun } from "#internet/workflow/types";

export interface WorkflowOperatorEngine {
	status(jobId: string): WorkflowJob;
	continue(jobId: string): WorkflowJob;
}

export interface WorkflowOperatorDriver {
	enqueue(jobId: string): void;
	cancel(jobId: string): Promise<WorkflowJob>;
	isActive(jobId: string): boolean;
}

export class WorkflowOperatorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowOperatorError";
	}
}

function ownerJobs(jobs: WorkflowJobStore, ownerSessionId: string): readonly WorkflowJob[] {
	return jobs
		.list()
		.filter((job) => job.ownerSessionId === ownerSessionId)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.jobId.localeCompare(b.jobId));
}

function selectJob(
	jobs: WorkflowJobStore,
	ownerSessionId: string,
	explicitJobId: string | undefined,
	requireActive: boolean,
): WorkflowJob {
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
	if (active.length === 1) return active[0]!;
	if (active.length > 1) {
		throw new WorkflowOperatorError(
			`multiple active workflows exist for this session; specify a jobId: ${active.map((job) => job.jobId).join(", ")}`,
		);
	}
	if (requireActive) throw new WorkflowOperatorError("this session has no active workflow");
	if (owned.length === 1) return owned[0]!;
	if (owned.length === 0) throw new WorkflowOperatorError("this session has no workflow jobs");
	throw new WorkflowOperatorError(
		`no active workflow exists and multiple historical jobs are available; specify a jobId: ${owned.map((job) => job.jobId).join(", ")}`,
	);
}

function compact(value: string, max = 72): string {
	const normalized = value.replace(/\s+/gu, " ").trim();
	return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function traceForRun(
	trace: readonly WorkflowTeamTraceEvent[],
	phase: "research" | "review",
	run: WorkflowTeamRun,
): WorkflowTeamTraceEvent | undefined {
	const matches = trace.filter(
		(event) =>
			event.phase === phase && event.lane === run.lane && event.attempt === run.attempts && event.stage !== "team",
	);
	return matches[matches.length - 1];
}

function describeTrace(event: WorkflowTeamTraceEvent | undefined): string | undefined {
	if (event === undefined) return undefined;
	return [
		...(event.round === undefined ? [] : [`round ${event.round}`]),
		...(event.accountId === undefined ? [] : [event.accountId]),
		event.stage,
		event.status.toUpperCase(),
		...(event.kind === undefined ? [] : [event.kind]),
	].join(" · ");
}

function formatLane(
	phase: "research" | "review",
	run: WorkflowTeamRun,
	trace: readonly WorkflowTeamTraceEvent[],
): string[] {
	const latest = traceForRun(trace, phase, run);
	const detail = describeTrace(latest);
	const outputContractFailure = run.status === "failed" && latest?.status === "completed" && run.error !== undefined;
	const renderedDetail = outputContractFailure ? "output_contract · FAILED" : detail;
	const lines = [
		`${run.lane}  ${run.status.toUpperCase()}  attempt ${run.attempts}${renderedDetail === undefined ? "" : ` · ${renderedDetail}`}`,
	];
	const message = outputContractFailure ? run.error : (latest?.message ?? run.error);
	if (message !== undefined && message.trim() !== "") lines.push(`   ${compact(message, 180)}`);
	return lines;
}

export function formatWorkflowList(jobs: readonly WorkflowJob[]): string {
	if (jobs.length === 0) return "No workflow jobs for this session.";
	return [
		"JOB                               STATE                            UPDATED                   OBJECTIVE",
		...jobs.map(
			(job) => `${job.jobId}  ${job.state.padEnd(31)}  ${job.updatedAt.padEnd(24)}  ${compact(job.objective, 70)}`,
		),
	].join("\n");
}

export function formatWorkflowStatus(
	job: WorkflowJob,
	trace: readonly WorkflowTeamTraceEvent[],
	active: boolean,
): string {
	const lines = [
		`Workflow ${job.jobId}`,
		`State: ${job.state}${active ? " · driver active" : ""}`,
		`Objective: ${job.objective}`,
		"",
		"Research",
	];
	for (const run of job.teamRuns.research)
		lines.push(...formatLane("research", run, trace).map((line) => `  ${line}`));
	lines.push(
		"",
		"Writer",
		`  ${job.writerConversation.accountId} · ${job.state === "CREATED" || job.state.startsWith("RESEARCH") ? "waiting for research" : job.state}`,
	);
	lines.push("", "Review");
	for (const run of job.teamRuns.review) lines.push(...formatLane("review", run, trace).map((line) => `  ${line}`));
	lines.push("", "PR");
	if (job.pullRequest === undefined) lines.push("  not created");
	else {
		lines.push(
			`  ${job.pullRequest.url}`,
			`  base=${job.pullRequest.base} head=${job.pullRequest.head}`,
			`  head_sha=${job.pullRequest.headSha}`,
			`  review_cycle=${job.reviewCycle}`,
		);
		if (job.ciReceipt !== undefined) lines.push(`  ci=${job.ciReceipt.status} checked=${job.ciReceipt.checkedAt}`);
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
	private readonly engine: WorkflowOperatorEngine;
	private readonly driver: WorkflowOperatorDriver;
	private readonly jobs: WorkflowJobStore;
	private readonly traces: WorkflowTeamTraceStore;

	constructor(
		engine: WorkflowOperatorEngine,
		driver: WorkflowOperatorDriver,
		jobs: WorkflowJobStore,
		traces: WorkflowTeamTraceStore,
	) {
		this.engine = engine;
		this.driver = driver;
		this.jobs = jobs;
		this.traces = traces;
	}

	list(ownerSessionId: string): string {
		return formatWorkflowList(ownerJobs(this.jobs, ownerSessionId));
	}

	status(ownerSessionId: string, jobId?: string): string {
		const job = selectJob(this.jobs, ownerSessionId, jobId, false);
		return formatWorkflowStatus(job, this.traces.list(job.jobId), this.driver.isActive(job.jobId));
	}

	watch(ownerSessionId: string, jobId?: string): string {
		const job = selectJob(this.jobs, ownerSessionId, jobId, false);
		return [
			formatWorkflowStatus(job, this.traces.list(job.jobId), this.driver.isActive(job.jobId)),
			"",
			"Live compact team/workflow progress events are emitted automatically to this Local session while the job runs.",
		].join("\n");
	}

	async stop(ownerSessionId: string, jobId?: string): Promise<string> {
		const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
		const trace = this.traces.list(selected.jobId);
		const latest = trace[trace.length - 1];
		const cancelled = await this.driver.cancel(selected.jobId);
		const stoppedAt = latest === undefined ? "unknown current operation" : (describeTrace(latest) ?? latest.stage);
		return `Workflow ${cancelled.jobId} cancelled.\nStopped at: ${stoppedAt}\nState: ${cancelled.state}`;
	}

	continue(ownerSessionId: string, jobId?: string): string {
		const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
		if (selected.state !== "FAILED_RETRYABLE" && selected.pendingAction?.resumeState === undefined) {
			throw new WorkflowOperatorError(`workflow job ${selected.jobId} has no explicit retry/recovery path`);
		}
		const resumed = this.engine.continue(selected.jobId);
		this.driver.enqueue(resumed.jobId);
		return `Workflow ${resumed.jobId} resumed from durable state ${resumed.state}.`;
	}
}
