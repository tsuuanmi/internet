import { randomBytes } from "node:crypto";
import { createWorkflowControlMessage, type WorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { type WorkflowTeamLane, WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner, WorkflowTeamRunResult } from "#internet/workflow/team-runner";
import {
	type StartWorkflowInput,
	TERMINAL_WORKFLOW_STATES,
	type WorkflowDecisionInput,
	type WorkflowHandoffReceipt,
	type WorkflowJob,
	type WorkflowState,
	type WorkflowTeamRun,
} from "#internet/workflow/types";

export class WorkflowEngineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowEngineError";
	}
}

export interface WorkflowControlStep {
	readonly job: WorkflowJob;
	readonly control: WorkflowControlMessage;
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
	return { ...current, revision: current.revision + 1, state, updatedAt: now() };
}

function replaceLane(
	runs: readonly [WorkflowTeamRun, WorkflowTeamRun],
	lane: WorkflowTeamLane,
	mutate: (run: WorkflowTeamRun) => WorkflowTeamRun,
): readonly [WorkflowTeamRun, WorkflowTeamRun] {
	return runs.map((run) => (run.lane === lane ? mutate(run) : run)) as unknown as readonly [
		WorkflowTeamRun,
		WorkflowTeamRun,
	];
}

function allCompleted(runs: readonly WorkflowTeamRun[]): boolean {
	return runs.every((run) => run.status === "completed");
}

function receipt(handoff: WorkflowHandoff): WorkflowHandoffReceipt {
	return {
		handoffId: handoff.handoffId,
		source: handoff.source,
		recipient: handoff.recipient,
		sequence: handoff.sequence,
		payloadHash: handoff.payloadHash,
		status: handoff.status,
	};
}

function upsertReceipts(
	current: readonly WorkflowHandoffReceipt[],
	incoming: readonly WorkflowHandoffReceipt[],
): readonly WorkflowHandoffReceipt[] {
	const byId = new Map(current.map((item) => [item.handoffId, item]));
	for (const item of incoming) byId.set(item.handoffId, item);
	return [...byId.values()].sort((a, b) => a.sequence - b.sequence || a.handoffId.localeCompare(b.handoffId));
}

function researchReceipts(job: WorkflowJob): WorkflowHandoffReceipt[] {
	return job.handoffReceipts.filter(
		(item) => item.recipient === job.accountRouting.writerAccount && /^research:[AB]$/u.test(item.source),
	);
}

export class WorkflowEngine {
	private readonly jobs: WorkflowJobStore;
	private readonly teams?: WorkflowTeamRunner;
	private readonly prompts: WorkflowTeamPromptBuilder;
	private readonly handoffs?: WorkflowHandoffStore;

	constructor(
		jobs: WorkflowJobStore,
		teams?: WorkflowTeamRunner,
		prompts = new WorkflowTeamPromptBuilder(),
		handoffs?: WorkflowHandoffStore,
	) {
		this.jobs = jobs;
		this.teams = teams;
		this.prompts = prompts;
		this.handoffs = handoffs;
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
		return this.jobs.create({
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
			writerConversation: { sessionId: writerSession(input.ownerSessionId, id), accountId: "chatgpt-writer" },
			reviewCycle: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
		});
	}

	status(jobId: string): WorkflowJob {
		const job = this.jobs.get(jobId);
		if (job === undefined) throw new WorkflowEngineError(`workflow job ${jobId} does not exist`);
		return job;
	}

	/** Run pending/failed research lanes concurrently; completed lanes are never repeated. */
	async runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob> {
		if (this.teams === undefined) throw new WorkflowEngineError("workflow team runner is not configured");
		const before = this.status(jobId);
		if (!["CREATED", "RESEARCH_RUNNING", "FAILED_RETRYABLE"].includes(before.state)) {
			throw new WorkflowEngineError(`workflow job ${jobId} cannot run research from ${before.state}`);
		}
		const lanes = before.teamRuns.research.filter((run) => run.status !== "completed").map((run) => run.lane);
		if (lanes.length === 0) {
			if (before.state === "RESEARCH_HANDOFFS_DELIVERING") return before;
			return this.jobs.update(jobId, (current) => withState(current, "RESEARCH_HANDOFFS_DELIVERING"));
		}

		const running = this.jobs.update(jobId, (current) => {
			let research = current.teamRuns.research;
			for (const lane of lanes) {
				research = replaceLane(research, lane, (run) => ({
					...run,
					status: "running",
					attempts: run.attempts + 1,
					error: undefined,
				}));
			}
			return {
				...withState(current, "RESEARCH_RUNNING"),
				teamRuns: { ...current.teamRuns, research },
				lastEvent: { type: "RESEARCH_STARTED", class: "INTERNAL", at: now() },
			};
		});

		await Promise.all(
			lanes.map(async (lane) => {
				const run = running.teamRuns.research.find((item) => item.lane === lane);
				if (run === undefined) throw new WorkflowEngineError(`missing research lane ${lane}`);
				let result: WorkflowTeamRunResult;
				try {
					result = await this.teams!.run({
						task: this.prompts.research(running, lane),
						sessionId: run.sessionId,
						accounts: running.accountRouting.thinkerAccounts,
						synthesizer: running.accountRouting.synthesizerAccount,
						signal,
					});
				} catch (error) {
					result = {
						ok: false,
						error: error instanceof Error ? error.message : String(error),
						failedAccountId: running.accountRouting.synthesizerAccount,
						failedProvider: "chatgpt-web",
					};
				}
				this.recordTeamResult(jobId, "research", lane, result);
			}),
		);

		return this.jobs.update(jobId, (current) => {
			const completed = allCompleted(current.teamRuns.research);
			return {
				...withState(current, completed ? "RESEARCH_HANDOFFS_DELIVERING" : "FAILED_RETRYABLE"),
				lastEvent: {
					type: completed ? "RESEARCH_COMPLETED" : "RESEARCH_RETRY_REQUIRED",
					class: completed ? "INTERNAL" : "ACTION_REQUIRED",
					at: now(),
					...(completed
						? {}
						: { message: "One or more research lanes failed; retry runs only incomplete lanes." }),
				},
			};
		});
	}

	/** Materialize exact research finals as durable data-plane handoffs. Idempotent by lane/sequence. */
	prepareResearchHandoffs(jobId: string): readonly WorkflowHandoff[] {
		if (this.handoffs === undefined) throw new WorkflowEngineError("workflow handoff store is not configured");
		const job = this.status(jobId);
		if (job.state !== "RESEARCH_HANDOFFS_DELIVERING") {
			throw new WorkflowEngineError(`workflow job ${jobId} cannot prepare research handoffs from ${job.state}`);
		}
		if (!allCompleted(job.teamRuns.research))
			throw new WorkflowEngineError("all research lanes must complete before handoff creation");
		const handoffs = job.teamRuns.research.map((run, index) => {
			if (run.result === undefined) throw new WorkflowEngineError(`research lane ${run.lane} has no final result`);
			return this.handoffs!.create({
				jobId,
				source: `research:${run.lane}`,
				recipient: job.accountRouting.writerAccount,
				sequence: index + 1,
				payload: run.result.finalAnswer,
			});
		});
		this.jobs.update(jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			handoffReceipts: upsertReceipts(current.handoffReceipts, handoffs.map(receipt)),
			lastEvent: { type: "RESEARCH_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },
			updatedAt: now(),
		}));
		return handoffs;
	}

	/** Mark a delivery only when the receiver consumed the exact expected payload hash. */
	markHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob {
		if (this.handoffs === undefined) throw new WorkflowEngineError("workflow handoff store is not configured");
		const delivered = this.handoffs.markDelivered(jobId, handoffId, expectedPayloadHash);
		return this.jobs.update(jobId, (current) => {
			if (!current.handoffReceipts.some((item) => item.handoffId === handoffId)) {
				throw new WorkflowEngineError(`handoff ${handoffId} is not registered on workflow job ${jobId}`);
			}
			return {
				...current,
				revision: current.revision + 1,
				handoffReceipts: upsertReceipts(current.handoffReceipts, [receipt(delivered)]),
				lastEvent: { type: "HANDOFF_DELIVERED", class: "INTERNAL", at: now() },
				updatedAt: now(),
			};
		});
	}

	/**
	 * Produce the trusted START_IMPLEMENTATION control only after both exact
	 * research data messages have delivery receipts. Replays are safe.
	 */
	startImplementationControl(jobId: string): WorkflowControlStep {
		const current = this.status(jobId);
		if (current.state !== "RESEARCH_HANDOFFS_DELIVERING" && current.state !== "WRITER_RUNNING") {
			throw new WorkflowEngineError(`workflow job ${jobId} cannot start implementation from ${current.state}`);
		}
		const receipts = researchReceipts(current);
		if (receipts.length !== 2 || !receipts.every((item) => item.status === "delivered")) {
			throw new WorkflowEngineError("writer cannot start until both research handoffs are delivered");
		}
		const job =
			current.state === "WRITER_RUNNING"
				? current
				: this.jobs.update(jobId, (state) => ({
						...withState(state, "WRITER_RUNNING"),
						lastEvent: { type: "START_IMPLEMENTATION_READY", class: "INTERNAL", at: now() },
					}));
		return { job, control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId) };
	}

	private recordTeamResult(
		jobId: string,
		phase: "research" | "review",
		lane: WorkflowTeamLane,
		result: WorkflowTeamRunResult,
	): void {
		this.jobs.update(jobId, (current) => {
			const runs = current.teamRuns[phase];
			const updated = replaceLane(runs, lane, (run) =>
				result.ok
					? {
							...run,
							status: "completed",
							error: undefined,
							result: {
								finalAnswer: result.finalAnswer,
								finalAccountId: result.finalAccountId,
								finalProvider: result.finalProvider,
								completedAt: now(),
								...(phase === "review" && current.pullRequest !== undefined
									? { reviewedHeadSha: current.pullRequest.headSha }
									: {}),
							},
						}
					: { ...run, status: "failed", error: result.error, result: undefined },
			);
			return {
				...current,
				revision: current.revision + 1,
				teamRuns: { ...current.teamRuns, [phase]: updated },
				updatedAt: now(),
			};
		});
	}

	cancel(jobId: string): WorkflowJob {
		return this.jobs.update(jobId, (current) => {
			if (TERMINAL_WORKFLOW_STATES.has(current.state))
				throw new WorkflowEngineError(`workflow job ${jobId} is already terminal (${current.state})`);
			return withState(current, "CANCELLED");
		});
	}

	continue(jobId: string): WorkflowJob {
		return this.jobs.update(jobId, (current) => {
			if (!new Set<WorkflowState>(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state))
				throw new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);
			return { ...withState(current, "CREATED"), pendingAction: undefined };
		});
	}

	approve(input: WorkflowDecisionInput): WorkflowJob {
		return this.jobs.update(input.jobId, (current) => {
			if (
				current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
				current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED"
			)
				throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
			if (
				current.pendingAction.expectedHeadSha !== undefined &&
				input.expectedHeadSha !== current.pendingAction.expectedHeadSha
			)
				throw new WorkflowEngineError("merge authorization head SHA does not match the pending action");
			return { ...withState(current, "READY_FOR_MERGE_AUTHORIZATION"), pendingAction: undefined };
		});
	}

	reject(input: WorkflowDecisionInput): WorkflowJob {
		return this.jobs.update(input.jobId, (current) => {
			if (current.pendingAction === undefined)
				throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
			return { ...withState(current, "BLOCKED"), pendingAction: undefined };
		});
	}
}
