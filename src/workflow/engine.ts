import { randomBytes } from "node:crypto";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import {
	type StartWorkflowInput,
	TERMINAL_WORKFLOW_STATES,
	type WorkflowDecisionInput,
	type WorkflowJob,
	type WorkflowState,
} from "#internet/workflow/types";

export class WorkflowEngineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowEngineError";
	}
}

function jobId(): string {
	return randomBytes(16).toString("hex");
}

function now(): string {
	return new Date().toISOString();
}

function laneSession(ownerSessionId: string, job: string, phase: "research" | "review", lane: "A" | "B"): string {
	return `${ownerSessionId}:workflow:${job}:${phase}:${lane}`;
}

function writerSession(ownerSessionId: string, job: string): string {
	return `${ownerSessionId}:workflow:${job}:writer`;
}

function withState(current: WorkflowJob, state: WorkflowState): WorkflowJob {
	return {
		...current,
		revision: current.revision + 1,
		state,
		updatedAt: now(),
	};
}

/**
 * Deterministic workflow state owner. Later TODOs attach TeamRunner, handoff,
 * writer, review, approval, and event controllers to this class.
 */
export class WorkflowEngine {
	private readonly jobs: WorkflowJobStore;

	constructor(jobs: WorkflowJobStore) {
		this.jobs = jobs;
	}

	start(input: StartWorkflowInput): WorkflowJob {
		const objective = input.objective.trim();
		if (objective === "") throw new WorkflowEngineError("workflow objective is required");
		if (input.repository.trim() === "") throw new WorkflowEngineError("workflow repository is required");
		if (!/^[0-9a-f]{40}$/u.test(input.baseRevision))
			throw new WorkflowEngineError("workflow base revision must be a full Git SHA");
		if (input.ownerSessionId.trim() === "") throw new WorkflowEngineError("workflow owner session id is required");

		const id = jobId();
		const timestamp = now();
		const job: WorkflowJob = {
			schema: "@tsuuanmi/internet-workflow-job",
			version: 1,
			revision: 1,
			jobId: id,
			objective,
			repository: input.repository,
			baseRevision: input.baseRevision,
			state: "CREATED",
			teamRuns: {
				research: [
					{
						lane: "A",
						status: "pending",
						attempts: 0,
						sessionId: laneSession(input.ownerSessionId, id, "research", "A"),
					},
					{
						lane: "B",
						status: "pending",
						attempts: 0,
						sessionId: laneSession(input.ownerSessionId, id, "research", "B"),
					},
				],
				review: [
					{
						lane: "A",
						status: "pending",
						attempts: 0,
						sessionId: laneSession(input.ownerSessionId, id, "review", "A"),
					},
					{
						lane: "B",
						status: "pending",
						attempts: 0,
						sessionId: laneSession(input.ownerSessionId, id, "review", "B"),
					},
				],
			},
			accountRouting: {
				thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
				writerAccount: "chatgpt-writer",
				synthesizerAccount: "chatgpt-thinker",
			},
			handoffReceipts: [],
			writerConversation: {
				sessionId: writerSession(input.ownerSessionId, id),
				accountId: "chatgpt-writer",
			},
			reviewCycle: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		return this.jobs.create(job);
	}

	status(jobId: string): WorkflowJob {
		const job = this.jobs.get(jobId);
		if (job === undefined) throw new WorkflowEngineError(`workflow job ${jobId} does not exist`);
		return job;
	}

	cancel(jobId: string): WorkflowJob {
		return this.jobs.update(jobId, (current) => {
			if (TERMINAL_WORKFLOW_STATES.has(current.state)) {
				throw new WorkflowEngineError(`workflow job ${jobId} is already terminal (${current.state})`);
			}
			return withState(current, "CANCELLED");
		});
	}

	continue(jobId: string): WorkflowJob {
		return this.jobs.update(jobId, (current) => {
			if (!new Set<WorkflowState>(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state)) {
				throw new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);
			}
			return {
				...withState(current, "CREATED"),
				pendingAction: undefined,
			};
		});
	}

	approve(input: WorkflowDecisionInput): WorkflowJob {
		return this.jobs.update(input.jobId, (current) => {
			if (
				current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
				current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED"
			) {
				throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
			}
			if (
				current.pendingAction.expectedHeadSha !== undefined &&
				input.expectedHeadSha !== current.pendingAction.expectedHeadSha
			) {
				throw new WorkflowEngineError("merge authorization head SHA does not match the pending action");
			}
			return {
				...withState(current, "READY_FOR_MERGE_AUTHORIZATION"),
				pendingAction: undefined,
			};
		});
	}

	reject(input: WorkflowDecisionInput): WorkflowJob {
		return this.jobs.update(input.jobId, (current) => {
			if (current.pendingAction === undefined) {
				throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
			}
			return {
				...withState(current, "BLOCKED"),
				pendingAction: undefined,
			};
		});
	}
}
