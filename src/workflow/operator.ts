import type { WorkflowEventJournal } from "#internet/workflow/events";
import type { WorkflowGraphNode, WorkflowPhase } from "#internet/workflow/graph";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowRetentionManager } from "#internet/workflow/retention";
import {
	WorkflowService,
	type WorkflowServiceDriver,
	type WorkflowServiceEngine,
	WorkflowServiceError,
	workflowSessionAuthorizationContext,
} from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";

export type WorkflowOperatorEngine = WorkflowServiceEngine;
export type WorkflowOperatorDriver = WorkflowServiceDriver;

export class WorkflowOperatorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowOperatorError";
	}
}

function asOperatorError(error: unknown): never {
	if (error instanceof WorkflowServiceError) throw new WorkflowOperatorError(error.message);
	throw error;
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
	if (reviewMember)
		return `Review ${reviewMember[2]} · Cycle ${reviewMember[1]} · R${reviewMember[3]} · Member ${reviewMember[4]}`;
	const reviewSynthesis = nodeId.match(/^review:cycle:(\d+):([AB]):synthesis$/u);
	if (reviewSynthesis) return `Review ${reviewSynthesis[2]} · Cycle ${reviewSynthesis[1]} · Synthesis`;
	const reviewGate = nodeId.match(/^review:cycle:(\d+):handoff-gate$/u);
	if (reviewGate) return `Review · Cycle ${reviewGate[1]} · Decision`;
	const remediation = nodeId.match(/^writer:remediation:cycle:(\d+)$/u);
	if (remediation) return `Writer · Remediation ${remediation[1]}`;
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
		.filter((node) => node.state === "RUNNING" || node.state === "RECOVERING")
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function nextDescription(job: WorkflowJob): string {
	if (job.pendingAction !== undefined) return `user action: ${job.pendingAction.kind}`;
	if (job.graph.lifecycle === "COMPLETED") {
		return job.writerConversation.url === undefined
			? "workflow complete"
			: "workflow complete; open the Writer chat for optional changes or merge";
	}
	const ready = Object.values(job.graph.nodes)
		.filter((node) => node.state === "READY")
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
	if (ready.length > 0) return ready.map((node) => nodeLabel(node.nodeId)).join(" + ");
	const recovering = Object.values(job.graph.nodes).find((node) => node.state === "RECOVERING");
	if (recovering !== undefined)
		return `${nodeLabel(recovering.nodeId)} · ${recovering.recovery?.action ?? "recovery"}`;
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
	events: readonly {
		readonly eventSeq: number;
		readonly at: string;
		readonly type: string;
		readonly nodeId?: string;
	}[],
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
		if (node.failure !== undefined)
			lines.push(`    failure=${node.failure.class}.${node.failure.code}: ${compact(node.failure.message, 180)}`);
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
	}

	lines.push(
		"",
		"Writer",
		`  account=${job.writerConversation.accountId}`,
		`  chat=${job.writerConversation.url ?? "pending"}`,
	);
	if (job.graph.lifecycle === "COMPLETED" && job.pullRequest !== undefined) {
		lines.push(
			"",
			"Handoff",
			`  reviewed_head=${job.pullRequest.headSha}`,
			"  Review coverage ends at this exact head.",
			"  Open the Writer chat for any additional changes or to merge; subsequent changes are user-controlled.",
		);
	}

	if (job.pendingAction !== undefined) {
		lines.push("", `ACTION REQUIRED: ${job.pendingAction.kind}`, `  ${job.pendingAction.message}`);
		if (job.pendingAction.nodeId !== undefined) lines.push(`  node=${nodeLabel(job.pendingAction.nodeId)}`);
		if (job.pendingAction.expectedHeadSha !== undefined)
			lines.push(`  expected_head=${job.pendingAction.expectedHeadSha}`);
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
	private readonly service: WorkflowService;
	private readonly events: WorkflowEventJournal;

	constructor(service: WorkflowService, events: WorkflowEventJournal);
	constructor(
		engine: WorkflowOperatorEngine,
		driver: WorkflowOperatorDriver,
		jobs: WorkflowJobStore,
		events: WorkflowEventJournal,
		retention: WorkflowRetentionManager,
	);
	constructor(
		serviceOrEngine: WorkflowService | WorkflowOperatorEngine,
		eventsOrDriver: WorkflowEventJournal | WorkflowOperatorDriver,
		jobs?: WorkflowJobStore,
		events?: WorkflowEventJournal,
		retention?: WorkflowRetentionManager,
	) {
		if (serviceOrEngine instanceof WorkflowService) {
			this.service = serviceOrEngine;
			this.events = eventsOrDriver as WorkflowEventJournal;
			return;
		}
		if (jobs === undefined || events === undefined || retention === undefined) {
			throw new WorkflowOperatorError(
				"legacy WorkflowOperator construction requires engine, driver, jobs, events, and retention",
			);
		}
		this.service = new WorkflowService(serviceOrEngine, eventsOrDriver as WorkflowOperatorDriver, jobs, retention);
		this.events = events;
	}

	list(ownerSessionId: string): string {
		try {
			return formatWorkflowList(this.service.list(workflowSessionAuthorizationContext(ownerSessionId)));
		} catch (error) {
			return asOperatorError(error);
		}
	}

	status(ownerSessionId: string, jobId?: string): string {
		try {
			const job = this.service.status(workflowSessionAuthorizationContext(ownerSessionId), jobId);
			return formatWorkflowStatus(job, this.events.list(job.jobId), this.service.isActive(job.jobId));
		} catch (error) {
			return asOperatorError(error);
		}
	}

	async stop(ownerSessionId: string, jobId?: string): Promise<string> {
		try {
			const cancelled = await this.service.cancel(workflowSessionAuthorizationContext(ownerSessionId), jobId);
			return `Workflow ${cancelled.jobId} cancelled.\nPhase: ${cancelled.graph.phase}\nStatus: ${cancelled.graph.lifecycle}`;
		} catch (error) {
			return asOperatorError(error);
		}
	}

	async delete(ownerSessionId: string, jobId?: string): Promise<string> {
		try {
			const deleted = await this.service.delete(workflowSessionAuthorizationContext(ownerSessionId), jobId);
			return `Workflow ${deleted.jobId} deleted. Previous status: ${deleted.lifecycle}. Removed ${deleted.deletedFiles} durable artifact file(s).`;
		} catch (error) {
			return asOperatorError(error);
		}
	}

	continue(ownerSessionId: string, jobId?: string): string {
		try {
			const resumed = this.service.continue(workflowSessionAuthorizationContext(ownerSessionId), jobId);
			return `Workflow ${resumed.jobId} resumed.\nPhase: ${resumed.graph.phase}\nStatus: ${resumed.graph.lifecycle}`;
		} catch (error) {
			return asOperatorError(error);
		}
	}
}
