import type { WorkflowEventJournal } from "#internet/workflow/events";
import type { WorkflowGraphNode, WorkflowPhase } from "#internet/workflow/graph";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRetentionManager } from "#internet/workflow/retention";
import type { WorkflowJob } from "#internet/workflow/types";
import { workflowJobIsTerminal } from "#internet/workflow/types";

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
		if (job === undefined) {
			throw new WorkflowOperatorError(`workflow job ${explicitJobId} does not belong to this session`);
		}
		if (requireActive && workflowJobIsTerminal(job)) {
			throw new WorkflowOperatorError(
				`workflow job ${job.jobId} is already terminal (${job.graph.lifecycle})`,
			);
		}
		return job;
	}
	const active = owned.filter((job) => !workflowJobIsTerminal(job));
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

function compact(value: string, max = 88): string {
	const normalized = value.replace(/\s+/gu, " ").trim();
	return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function nodeLabel(nodeId: string): string {
	const researchMember = nodeId.match(/^research:([AB]):round:(\d+):member:(\d+)$/u);
	if (researchMember) return `Research ${researchMember[1]} · R${researchMember[2]} · Member ${researchMember[3]}`;
	const researchSynthesis = nodeId.match(/^research:([AB]):synthesis$/u);
	if (researchSynthesis) return `Research ${researchSynthesis[1]} · Synthesis`;
	if (nodeId === "research:handoff-gate") return "Research · Handoff";
	if (nodeId === "writer:implementation") return "Writer · Implementation";
	const reviewMember = nodeId.match(/^review:cycle:(\d+):([AB]):round:(\d+):member:(\d+)$/u);
	if (reviewMember) {
		return `Review ${reviewMember[2]} · Cycle ${reviewMember[1]} · R${reviewMember[3]} · Member ${reviewMember[4]}`;
	}
	const reviewSynthesis = nodeId.match(/^review:cycle:(\d+):([AB]):synthesis$/u);
	if (reviewSynthesis) return `Review ${reviewSynthesis[2]} · Cycle ${reviewSynthesis[1]} · Synthesis`;
	const reviewGate = nodeId.match(/^review:cycle:(\d+):handoff-gate$/u);
	if (reviewGate) return `Review · Cycle ${reviewGate[1]} · Decision`;
	const remediation = nodeId.match(/^writer:remediation:cycle:(\d+)$/u);
	if (remediation) return `Writer · Remediation ${remediation[1]}`;
	const health = nodeId.match(/^pr-health:cycle:(\d+)$/u);
	if (health) return `PR health · Cycle ${health[1]}`;
	const authorization = nodeId.match(/^merge-authorization:cycle:(\d+)$/u);
	if (authorization) return `Merge authorization · Cycle ${authorization[1]}`;
	const merge = nodeId.match(/^merge:cycle:(\d+)$/u);
	if (merge) return `Merge · Cycle ${merge[1]}`;
	return nodeId;
}

function phaseSummary(job: WorkflowJob, phase: WorkflowPhase): string {
	const nodes = Object.values(job.graph.nodes).filter((node) => node.phase === phase);
	if (nodes.length === 0) return "not created";
	const counts = new Map<string, number>();
	for (const node of nodes) counts.set(node.state, (counts.get(node.state) ?? 0) + 1);
	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([state, count]) => `${state.toLowerCase()}=${count}`)
		.join(" · ");
}

function blockedBy(job: WorkflowJob, node: WorkflowGraphNode): readonly string[] {
	return node.dependencies.filter((id) => job.graph.nodes[id]?.state !== "COMPLETED");
}

function activeNodes(job: WorkflowJob): readonly WorkflowGraphNode[] {
	return Object.values(job.graph.nodes)
		.filter((node) => node.state === "RUNNING" || node.state === "WAITING_USER" || node.state === "RECOVERING")
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function nextDescription(job: WorkflowJob): string {
	if (job.pendingAction !== undefined) return `user action: ${job.pendingAction.kind}`;
	const ready = Object.values(job.graph.nodes)
		.filter((node) => node.state === "READY")
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
	if (ready.length > 0) return ready.map((node) => nodeLabel(node.nodeId)).join(" + ");
	const recovering = Object.values(job.graph.nodes).find((node) => node.state === "RECOVERING");
	if (recovering !== undefined) {
		return `${nodeLabel(recovering.nodeId)} · ${recovering.recovery?.action ?? "recovery"}`;
	}
	const waiting = Object.values(job.graph.nodes).find((node) => node.state === "WAITING");
	if (waiting !== undefined) return `${nodeLabel(waiting.nodeId)} waits on dependencies`;
	return job.graph.lifecycle.toLowerCase();
}

export function formatWorkflowList(jobs: readonly WorkflowJob[]): string {
	if (jobs.length === 0) return "No workflow jobs for this session.";
	return [
		"JOB                               PHASE      STATUS        UPDATED                   OBJECTIVE",
		...jobs.map(
			(job) =>
				`${job.jobId}  ${job.graph.phase.padEnd(9)}  ${job.graph.lifecycle.padEnd(12)}  ${job.updatedAt.padEnd(24)}  ${compact(job.objective, 64)}`,
		),
	].join("\n");
}

export function formatWorkflowStatus(
	job: WorkflowJob,
	events: readonly { readonly eventSeq: number; readonly at: string; readonly type: string; readonly nodeId?: string }[],
	driverActive: boolean,
): string {
	const lines = [
		`Workflow ${job.jobId}`,
		`Phase: ${job.graph.phase}`,
		`Status: ${job.graph.lifecycle}${driverActive ? " · driver healthy" : " · driver idle"}`,
		`Objective: ${job.objective}`,
		"",
		"Progress",
		`  Research  ${phaseSummary(job, "RESEARCH")}`,
		`  Writer    ${phaseSummary(job, "WRITER")}`,
		`  Review    ${phaseSummary(job, "REVIEW")}`,
		`  Health    ${phaseSummary(job, "HEALTH")}`,
		`  Merge     ${phaseSummary(job, "MERGE")}`,
	];

	const active = activeNodes(job);
	lines.push("", "Active / recovery");
	if (active.length === 0) lines.push("  none");
	for (const node of active) {
		lines.push(`  ${nodeLabel(node.nodeId)} — ${node.state}`);
		if (node.execution !== undefined) {
			lines.push(
				`    execution=${node.execution.executionId} attempt=${node.execution.attempt}`,
				`    provider=${node.execution.providerState ?? "unknown"} started=${node.execution.startedAt}`,
				`    last_progress=${node.execution.lastMeaningfulProgressAt ?? "none"} lease_until=${node.execution.leaseUntil}`,
			);
		}
		if (node.failure !== undefined) lines.push(`    failure=${node.failure.class}.${node.failure.code}: ${compact(node.failure.message, 180)}`);
		if (node.recovery !== undefined) {
			lines.push(
				`    recovery=${node.recovery.action} attempt=${node.recovery.attempt}/${node.recovery.maxAttempts}${node.recovery.notBefore ? ` not_before=${node.recovery.notBefore}` : ""}`,
			);
		}
	}

	lines.push("", "Graph");
	for (const node of Object.values(job.graph.nodes).sort((a, b) => a.nodeId.localeCompare(b.nodeId))) {
		const blockers = blockedBy(job, node);
		const suffix = blockers.length === 0 ? "" : ` · blocked by ${blockers.map(nodeLabel).join(", ")}`;
		lines.push(`  ${nodeLabel(node.nodeId)} — ${node.state}${suffix}`);
		if (node.failure !== undefined && node.state === "FAILED") {
			lines.push(`    ${node.failure.class}.${node.failure.code}: ${compact(node.failure.message, 180)}`);
		}
	}

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
		if (job.pendingAction.nodeId !== undefined) lines.push(`  node=${nodeLabel(job.pendingAction.nodeId)}`);
		if (job.pendingAction.expectedHeadSha !== undefined) lines.push(`  expected_head=${job.pendingAction.expectedHeadSha}`);
	}

	lines.push("", "Recent events");
	if (events.length === 0) lines.push("  none");
	for (const event of events.slice(-8)) {
		lines.push(
			`  #${event.eventSeq} ${event.at}  ${event.type}${event.nodeId === undefined ? "" : ` · ${nodeLabel(event.nodeId)}`}`,
		);
	}
	lines.push("", "Next", `  ${nextDescription(job)}`, "", `Last durable update: ${job.updatedAt}`);
	return lines.join("\n");
}

export class WorkflowOperator {
	private readonly engine: WorkflowOperatorEngine;
	private readonly driver: WorkflowOperatorDriver;
	private readonly jobs: WorkflowJobStore;
	private readonly events: WorkflowEventJournal;
	private readonly retention: WorkflowRetentionManager;

	constructor(
		engine: WorkflowOperatorEngine,
		driver: WorkflowOperatorDriver,
		jobs: WorkflowJobStore,
		events: WorkflowEventJournal,
		retention: WorkflowRetentionManager,
	) {
		this.engine = engine;
		this.driver = driver;
		this.jobs = jobs;
		this.events = events;
		this.retention = retention;
	}

	list(ownerSessionId: string): string {
		return formatWorkflowList(ownerJobs(this.jobs, ownerSessionId));
	}

	status(ownerSessionId: string, jobId?: string): string {
		const job = selectJob(this.jobs, ownerSessionId, jobId, false);
		return formatWorkflowStatus(job, this.events.list(job.jobId), this.driver.isActive(job.jobId));
	}

	watch(ownerSessionId: string, jobId?: string): string {
		const job = selectJob(this.jobs, ownerSessionId, jobId, false);
		return [
			formatWorkflowStatus(job, this.events.list(job.jobId), this.driver.isActive(job.jobId)),
			"",
			"Watching: durable graph events will report node readiness, execution, recovery, user-action boundaries, and completion.",
		].join("\n");
	}

	async stop(ownerSessionId: string, jobId?: string): Promise<string> {
		const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
		const cancelled = await this.driver.cancel(selected.jobId);
		return `Workflow ${cancelled.jobId} cancelled.\nPhase: ${cancelled.graph.phase}\nStatus: ${cancelled.graph.lifecycle}`;
	}

	async delete(ownerSessionId: string, jobId?: string): Promise<string> {
		if (jobId === undefined) throw new WorkflowOperatorError("/workflow delete requires an explicit jobId");
		const selected = selectJob(this.jobs, ownerSessionId, jobId, false);
		const terminal = workflowJobIsTerminal(selected) ? selected : await this.driver.cancel(selected.jobId);
		const deleted = this.retention.deleteNow({
			jobId: terminal.jobId,
			expectedUpdatedAt: terminal.updatedAt,
			operatorSessionId: ownerSessionId,
		});
		return `Workflow ${deleted.jobId} deleted. Previous status: ${deleted.lifecycle}. Removed ${deleted.deletedFiles} durable artifact file(s).`;
	}

	continue(ownerSessionId: string, jobId?: string): string {
		const selected = selectJob(this.jobs, ownerSessionId, jobId, true);
		if (selected.graph.lifecycle === "WAITING_USER") {
			throw new WorkflowOperatorError(
				`workflow job ${selected.jobId} is waiting for explicit user authority; continue would not duplicate that action`,
			);
		}
		if (this.driver.isActive(selected.jobId)) {
			throw new WorkflowOperatorError(`workflow job ${selected.jobId} already has an active driver`);
		}
		if (selected.graph.lifecycle !== "BLOCKED" && selected.graph.lifecycle !== "RECOVERING") {
			throw new WorkflowOperatorError(`workflow job ${selected.jobId} has no explicit recovery path`);
		}
		const resumed = this.engine.continue(selected.jobId);
		this.driver.enqueue(resumed.jobId);
		return `Workflow ${resumed.jobId} resumed.\nPhase: ${resumed.graph.phase}\nStatus: ${resumed.graph.lifecycle}`;
	}
}
