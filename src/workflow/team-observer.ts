import type { TeamProgressEvent } from "#internet/team/types";
import type { WorkflowEventSink } from "#internet/workflow/events";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowTeamLane, WorkflowTeamPhase } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";

export interface WorkflowTeamContext {
	readonly jobId: string;
	readonly phase: WorkflowTeamPhase;
	readonly lane: WorkflowTeamLane;
}

export interface WorkflowTeamObservation {
	readonly context: WorkflowTeamContext;
	readonly attempt: number;
}

export interface WorkflowTeamObserver {
	begin(sessionId: string): WorkflowTeamObservation;
	record(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
	complete(observation: WorkflowTeamObservation, at: string): void;
	fail(observation: WorkflowTeamObservation, event: TeamProgressEvent): void;
}

export function parseWorkflowTeamSessionId(sessionId: string): WorkflowTeamContext {
	const match = /:workflow:([0-9a-f]{32}):(research|review):([AB])$/u.exec(sessionId);
	if (match === null) throw new Error("workflow team session identity is invalid");
	return {
		jobId: match[1]!,
		phase: match[2] as WorkflowTeamPhase,
		lane: match[3] as WorkflowTeamLane,
	};
}

function progressMessage(observation: WorkflowTeamObservation, event: TeamProgressEvent): string {
	const fields = [
		`${observation.context.phase}:${observation.context.lane}`,
		`attempt=${observation.attempt}`,
		...(event.round === undefined ? [] : [`round=${event.round}`]),
		`account=${event.accountId}`,
		`stage=${event.stage}`,
		`status=${event.status}`,
	];
	if (event.kind !== undefined) fields.push(`kind=${event.kind}`);
	if (event.message !== undefined && event.message.trim() !== "") fields.push(`message=${event.message}`);
	return fields.join(" ");
}

/** Persist team traces first, then emit compact best-effort Local progress notifications. */
export class DurableWorkflowTeamObserver implements WorkflowTeamObserver {
	private readonly traces: WorkflowTeamTraceStore;
	private readonly jobs: WorkflowJobStore;
	private readonly events?: WorkflowEventSink;

	constructor(traces: WorkflowTeamTraceStore, jobs: WorkflowJobStore, events?: WorkflowEventSink) {
		this.traces = traces;
		this.jobs = jobs;
		this.events = events;
	}

	begin(sessionId: string): WorkflowTeamObservation {
		const context = parseWorkflowTeamSessionId(sessionId);
		const attempt = this.traces.begin(context.jobId, context.phase, context.lane, new Date().toISOString());
		return { context, attempt };
	}

	record(observation: WorkflowTeamObservation, event: TeamProgressEvent): void {
		this.traces.append(observation.context.jobId, {
			phase: observation.context.phase,
			lane: observation.context.lane,
			attempt: observation.attempt,
			...event,
		});
		this.publish(observation, event);
	}

	complete(observation: WorkflowTeamObservation, at: string): void {
		this.traces.append(observation.context.jobId, {
			phase: observation.context.phase,
			lane: observation.context.lane,
			attempt: observation.attempt,
			at,
			stage: "team",
			status: "completed",
		});
	}

	fail(observation: WorkflowTeamObservation, event: TeamProgressEvent): void {
		this.traces.append(observation.context.jobId, {
			phase: observation.context.phase,
			lane: observation.context.lane,
			attempt: observation.attempt,
			...event,
			stage: "team",
			status: "failed",
		});
	}

	private publish(observation: WorkflowTeamObservation, event: TeamProgressEvent): void {
		if (this.events === undefined) return;
		const job = this.jobs.get(observation.context.jobId);
		if (job === undefined) return;
		try {
			this.events.publish(job, {
				type: "TEAM_PROGRESS",
				class: "PROGRESS",
				at: event.at,
				message: progressMessage(observation, event),
			});
		} catch {
			// Notification delivery is not workflow correctness.
		}
	}
}
