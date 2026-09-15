import { randomBytes } from "node:crypto";
import type { ProviderProgressEvent } from "#internet/browser/completion";
import { DEFAULT_TEAM_ACCOUNTS, DEFAULT_TEAM_SYNTHESIZER, getAccountDefinition } from "#internet/core/accounts";
import { buildTeamPlan, type TeamPlanStep } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamFailureDetail, TeamProgressEvent, TeamTurn } from "#internet/team/types";
import { normalizeGitHubRepository } from "#internet/workflow/approval-policy";
import { createWorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowEventJournal, WorkflowEventSink } from "#internet/workflow/events";
import {
	type WorkflowExecutionRecord,
	type WorkflowFailure,
	type WorkflowGraphNode,
	type WorkflowGraphSnapshot,
	type WorkflowLane,
	type WorkflowNodeInputReceipt,
	workflowNodeId,
} from "#internet/workflow/graph";
import {
	buildHealthNode,
	buildInitialWorkflowGraph,
	buildMergeAuthorizationNode,
	buildMergeNode,
	buildRemediationNode,
	buildReviewCycleNodes,
	createTeamStepInputReceipt,
	createWorkflowNodeInputReceipt,
	hashWorkflowGraphValue,
} from "#internet/workflow/graph-builder";
import {
	appendWorkflowNodes,
	cancelWorkflowGraph,
	completeWorkflowGateNode,
	completeWorkflowNode,
	failWorkflowNode,
	recoverWorkflowNode,
	setWorkflowGraphStatus,
	startWorkflowNode,
	updateWorkflowExecution,
} from "#internet/workflow/graph-reducer";
import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowNodeResult, WorkflowNodeResultStore } from "#internet/workflow/node-result-store";
import {
	classifyTeamFailure,
	classifyWorkflowFailure,
	DEFAULT_WORKFLOW_RECOVERY_POLICY,
	executionLeaseExpired,
	recoveryPlanForFailure,
	type WorkflowRecoveryPolicy,
} from "#internet/workflow/recovery";
import { WORKFLOW_BASE_BRANCH } from "#internet/workflow/repository-context";
import { parseWorkflowReviewResult } from "#internet/workflow/review-result";
import { promoteReadyWorkflowNodes } from "#internet/workflow/scheduler";
import type { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import {
	type StartWorkflowInput,
	type WorkflowCiReceipt,
	type WorkflowEventRecord,
	type WorkflowHandoffReceipt,
	type WorkflowJob,
	type WorkflowMergeAuthorization,
	type WorkflowPendingAction,
	type WorkflowPullRequestReceipt,
	workflowJobIsTerminal,
} from "#internet/workflow/types";
import type { WorkflowWriterResult, WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const DEFAULT_MAX_REVIEW_CYCLES = 3;
const DEFAULT_EXECUTION_LEASE_MS = 60_000;

export interface WorkflowEngineOptions {
	readonly maxReviewCycles?: number;
	readonly executionLeaseMs?: number;
	readonly recoveryPolicy?: WorkflowRecoveryPolicy;
}

export class WorkflowEngine {
	private readonly jobs: WorkflowJobStore;
	private readonly teams: WorkflowTeamRunner;
	private readonly prompts: WorkflowTeamPromptBuilder;
	private readonly handoffs: WorkflowHandoffStore;
	private readonly writer: WorkflowWriterRunner;
	private readonly results: WorkflowNodeResultStore;
	private readonly events?: WorkflowEventSink;
	private readonly journal?: WorkflowEventJournal;
	private readonly maxReviewCycles: number;
	private readonly executionLeaseMs: number;
	private readonly recoveryPolicy: WorkflowRecoveryPolicy;

	constructor(
		jobs: WorkflowJobStore,
		teams: WorkflowTeamRunner,
		prompts: WorkflowTeamPromptBuilder,
		handoffs: WorkflowHandoffStore,
		writer: WorkflowWriterRunner,
		results: WorkflowNodeResultStore,
		events?: WorkflowEventSink,
		journal?: WorkflowEventJournal,
		options: WorkflowEngineOptions = {},
	) {
		this.jobs = jobs;
		this.teams = teams;
		this.prompts = prompts;
		this.handoffs = handoffs;
		this.writer = writer;
		this.results = results;
		this.events = events;
		this.journal = journal;
		this.maxReviewCycles = options.maxReviewCycles ?? DEFAULT_MAX_REVIEW_CYCLES;
		this.executionLeaseMs = options.executionLeaseMs ?? DEFAULT_EXECUTION_LEASE_MS;
		this.recoveryPolicy = options.recoveryPolicy ?? DEFAULT_WORKFLOW_RECOVERY_POLICY;
	}

	start(input: StartWorkflowInput): WorkflowJob {
		if (input.objective.trim() === "") throw new Error("workflow objective is required");
		if (input.ownerSessionId.trim() === "") throw new Error("workflow owner session is required");
		if (!/^[0-9a-f]{40}$/u.test(input.baseRevision)) throw new Error("workflow base revision must be a full Git SHA");
		const jobId = randomBytes(16).toString("hex");
		const thinkerAccounts = DEFAULT_TEAM_ACCOUNTS;
		const synthesizer = DEFAULT_TEAM_SYNTHESIZER;
		const promptContext = {
			objective: input.objective,
			repository: input.repository,
			baseRevision: input.baseRevision,
		};
		const research = {
			A: {
				task: this.prompts.research(promptContext, "A"),
				sessionId: this.teamSession(input.ownerSessionId, jobId, "research", "A"),
			},
			B: {
				task: this.prompts.research(promptContext, "B"),
				sessionId: this.teamSession(input.ownerSessionId, jobId, "research", "B"),
			},
		};
		const graph = buildInitialWorkflowGraph({
			repository: input.repository,
			baseRevision: input.baseRevision,
			rounds: this.teams.rounds,
			accounts: thinkerAccounts,
			synthesizer,
			research,
		});
		const at = new Date().toISOString();
		return this.jobs.create({
			schema: "@tsuuanmi/internet-workflow-job",
			version: 2,
			revision: 1,
			jobId,
			ownerSessionId: input.ownerSessionId,
			objective: input.objective,
			repository: input.repository,
			baseRevision: input.baseRevision,
			graph,
			accountRouting: {
				thinkerAccounts,
				writerAccount: "chatgpt-writer",
				synthesizerAccount: synthesizer,
			},
			handoffReceipts: [],
			writerConversation: {
				sessionId: `${input.ownerSessionId}:workflow:${jobId}:writer`,
				accountId: "chatgpt-writer",
			},
			reviewCycle: 0,
			createdAt: at,
			updatedAt: at,
		});
	}

	status(jobId: string): WorkflowJob {
		const job = this.jobs.get(jobId);
		if (job === undefined) throw new Error(`workflow job ${jobId} does not exist`);
		return job;
	}

	advance(jobId: string): WorkflowJob {
		const current = this.status(jobId);
		if (
			workflowJobIsTerminal(current) ||
			current.graph.lifecycle === "BLOCKED" ||
			current.graph.lifecycle === "WAITING_USER"
		) {
			return current;
		}
		const graph = promoteReadyWorkflowNodes(current.graph, (node, candidate) =>
			this.inputForNode(current, node, candidate),
		);
		if (graph === current.graph) return current;
		return this.commit(jobId, { type: "NODES_READY", class: "INTERNAL", at: new Date().toISOString() }, (job) => ({
			...job,
			graph: this.project(graph, job.pendingAction, job.mergeReceipt),
		}));
	}

	runnableNodeIds(jobId: string, at = Date.now()): readonly string[] {
		const job = this.status(jobId);
		return Object.values(job.graph.nodes)
			.filter((node) => {
				if (node.state === "READY") return node.kind !== "MERGE_AUTHORIZATION";
				if (node.state !== "RECOVERING" || node.recovery === undefined) return false;
				if (node.recovery.action === "USER_ACTION" || node.recovery.action === "CODE_FIX") return false;
				return node.recovery.notBefore === undefined || Date.parse(node.recovery.notBefore) <= at;
			})
			.map((node) => node.nodeId)
			.sort();
	}

	nextRecoveryAt(jobId: string): string | undefined {
		const times = Object.values(this.status(jobId).graph.nodes)
			.filter((node) => node.state === "RECOVERING" && node.recovery?.notBefore !== undefined)
			.map((node) => node.recovery!.notBefore!)
			.sort();
		return times[0];
	}

	reconcile(jobId: string, ownerInstanceId: string, at = Date.now()): WorkflowJob {
		let current = this.status(jobId);
		if (workflowJobIsTerminal(current)) return current;
		for (const node of Object.values(current.graph.nodes)) {
			if ((node.state !== "RUNNING" && node.state !== "WAITING_USER") || node.execution === undefined) continue;
			if (node.execution.ownerInstanceId === ownerInstanceId && !executionLeaseExpired(node.execution, at)) continue;
			const failure: WorkflowFailure = {
				class: "TRANSPORT",
				code: "EXECUTION_ORPHANED",
				message: "durable execution no longer has a valid owner lease",
				retry: "IMMEDIATE",
				at: new Date(at).toISOString(),
			};
			const recovery = recoveryPlanForFailure(failure, node.execution.attempt, this.recoveryPolicy, at);
			if (recovery === undefined) {
				current = this.failNode(current.jobId, node.nodeId, failure, {
					kind: "USER_ACTION_REQUIRED",
					message: "orphan recovery exhausted the node retry budget",
					nodeId: node.nodeId,
				});
				continue;
			}
			current = this.commit(
				current.jobId,
				{
					type: "EXECUTION_ORPHANED",
					class: "PROGRESS",
					at: failure.at,
					nodeId: node.nodeId,
					executionId: node.execution.executionId,
				},
				(job) => ({
					...job,
					graph: this.project(
						recoverWorkflowNode(job.graph, node.nodeId, node.execution!.executionId, "ORPHANED", failure, {
							...recovery,
							action: "RECONCILE",
						}),
						undefined,
						job.mergeReceipt,
					),
					pendingAction: undefined,
				}),
			);
		}
		return current;
	}

	async executeNode(
		jobId: string,
		nodeId: string,
		ownerInstanceId: string,
		signal?: AbortSignal,
	): Promise<WorkflowJob> {
		let job = this.status(jobId);
		const node = job.graph.nodes[nodeId];
		if (node === undefined) throw new Error(`workflow node ${nodeId} does not exist`);
		if (node.state !== "READY" && node.state !== "RECOVERING") return job;
		if (node.input === undefined) throw new Error(`workflow node ${nodeId} has no exact input receipt`);

		const persisted = this.results.getForInput(jobId, nodeId, node.input.inputHash);
		if (persisted !== undefined) return this.commitReconciledResult(job, node, persisted);
		if (node.kind === "MERGE_AUTHORIZATION") return job;

		const execution = this.newExecution(node, ownerInstanceId);
		job = this.commit(
			jobId,
			{
				type: "EXECUTION_STARTED",
				class: "PROGRESS",
				at: execution.startedAt,
				nodeId,
				executionId: execution.executionId,
			},
			(current) => ({
				...current,
				graph: this.project(startWorkflowNode(current.graph, nodeId, execution), undefined, current.mergeReceipt),
				pendingAction: undefined,
			}),
		);
		const heartbeat = setInterval(
			() => this.heartbeat(jobId, nodeId, execution.executionId),
			Math.max(5_000, Math.floor(this.executionLeaseMs / 3)),
		);
		try {
			const payload = await this.runNode(job, nodeId, execution.executionId, signal);
			if (payload === undefined) return this.status(jobId);
			const result = this.results.create({
				jobId,
				nodeId,
				inputHash: node.input.inputHash,
				payload,
			});
			return this.commitNodeResult(jobId, nodeId, execution.executionId, result);
		} catch (error) {
			if (signal?.aborted) throw error;
			return this.handleExecutionFailure(jobId, nodeId, execution.executionId, error);
		} finally {
			clearInterval(heartbeat);
		}
	}

	continue(jobId: string): WorkflowJob {
		const job = this.status(jobId);
		if (workflowJobIsTerminal(job)) throw new Error(`workflow job ${jobId} is terminal`);
		if (job.pendingAction?.kind === "MERGE_AUTHORIZATION_REQUIRED") return job;
		const failed = Object.values(job.graph.nodes).filter((node) => node.state === "FAILED");
		if (failed.length === 0) return job;
		if (failed.length !== 1)
			throw new Error("workflow has multiple terminal failed nodes; code intervention is required");
		const node = failed[0]!;
		const attempt = (node.execution?.attempt ?? 0) + 1;
		if (attempt > this.recoveryPolicy.maxAttempts)
			throw new Error(`workflow node ${node.nodeId} exhausted retry budget`);
		const graph: WorkflowGraphSnapshot = {
			...job.graph,
			graphRevision: job.graph.graphRevision + 1,
			lifecycle: "RECOVERING",
			nodes: {
				...job.graph.nodes,
				[node.nodeId]: {
					...node,
					state: "RECOVERING",
					recovery: {
						action: "RECONCILE",
						attempt,
						maxAttempts: this.recoveryPolicy.maxAttempts,
					},
				},
			},
		};
		return this.commit(
			jobId,
			{ type: "RECOVERY_REQUESTED", class: "PROGRESS", at: new Date().toISOString(), nodeId: node.nodeId },
			(current) => ({ ...current, graph, pendingAction: undefined }),
		);
	}

	authorizeMerge(jobId: string, ownerSessionId: string, expectedHeadSha: string): WorkflowJob {
		const job = this.status(jobId);
		if (job.ownerSessionId !== ownerSessionId)
			throw new Error("merge authorization owner does not match workflow owner");
		if (job.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED" || job.pullRequest === undefined) {
			throw new Error("workflow is not waiting for merge authorization");
		}
		if (job.pullRequest.headSha !== expectedHeadSha) throw new Error("merge authorization head SHA is stale");
		const authorization: WorkflowMergeAuthorization = {
			repository: job.pullRequest.repository,
			number: job.pullRequest.number,
			url: job.pullRequest.url,
			head: job.pullRequest.head,
			headSha: job.pullRequest.headSha,
			reviewCycle: job.reviewCycle,
			authorizedAt: new Date().toISOString(),
			authorizedByOwnerSessionId: ownerSessionId,
		};
		const authNode = buildMergeAuthorizationNode(job.reviewCycle);
		const dependencyHashes = this.dependencyHashes(authNode, job.graph);
		const input = createWorkflowNodeInputReceipt(authNode.nodeId, dependencyHashes, {
			headSha: expectedHeadSha,
			reviewCycle: job.reviewCycle,
			ownerSessionId,
		});
		const result = this.results.create({
			jobId,
			nodeId: authNode.nodeId,
			inputHash: input.inputHash,
			payload: JSON.stringify(authorization),
		});
		let graph = appendWorkflowNodes(job.graph, [{ ...authNode, state: "READY", input }]);
		graph = completeWorkflowGateNode(graph, authNode.nodeId, this.outputReceipt(result));
		graph = appendWorkflowNodes(graph, [buildMergeNode(job.reviewCycle)]);
		graph = setWorkflowGraphStatus(graph, "MERGE", "RUNNING");
		return this.commit(
			jobId,
			{
				type: "MERGE_AUTHORIZED",
				class: "PROGRESS",
				at: authorization.authorizedAt,
				nodeId: authNode.nodeId,
			},
			(current) => ({
				...current,
				graph,
				mergeAuthorization: authorization,
				pendingAction: undefined,
			}),
		);
	}

	blockSchedulerFailure(jobId: string, error: unknown): WorkflowJob {
		const job = this.status(jobId);
		if (workflowJobIsTerminal(job) || job.graph.lifecycle === "BLOCKED") return job;
		const at = new Date().toISOString();
		const message = `workflow scheduler failed: ${error instanceof Error ? error.message : String(error)}`;
		return this.commit(jobId, { type: "SCHEDULER_FAILED", class: "ACTION_REQUIRED", at, message }, (current) => ({
			...current,
			graph: {
				...current.graph,
				graphRevision: current.graph.graphRevision + 1,
				lifecycle: "BLOCKED",
			},
			pendingAction: { kind: "CODE_FIX_REQUIRED", message },
		}));
	}

	cancel(jobId: string): WorkflowJob {
		const job = this.status(jobId);
		if (workflowJobIsTerminal(job)) return job;
		return this.commit(
			jobId,
			{ type: "WORKFLOW_CANCELLED", class: "PROGRESS", at: new Date().toISOString() },
			(current) => ({ ...current, graph: cancelWorkflowGraph(current.graph), pendingAction: undefined }),
		);
	}

	private async runNode(
		job: WorkflowJob,
		nodeId: string,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const node = job.graph.nodes[nodeId]!;
		switch (node.kind) {
			case "TEAM_MEMBER":
			case "TEAM_SYNTHESIS":
				return this.runTeamNode(job, node, executionId, signal);
			case "RESEARCH_HANDOFF_GATE":
				return this.runResearchHandoffGate(job, node, executionId, signal);
			case "WRITER_IMPLEMENTATION":
				return this.runWriterImplementation(job, node, executionId, signal);
			case "REVIEW_HANDOFF_GATE":
				return this.runReviewGate(job, node, executionId, signal);
			case "WRITER_REMEDIATION":
				return this.runWriterRemediation(job, node, executionId, signal);
			case "PR_HEALTH":
				return this.runHealth(job, node, executionId, signal);
			case "MERGE":
				return this.runMerge(job, node, executionId, signal);
			case "MERGE_AUTHORIZATION":
				return undefined;
		}
	}

	private async runTeamNode(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string> {
		const context = this.teamNodeContext(job, node);
		const result = await this.teams.runStep({
			plan: context.plan,
			step: context.step,
			task: context.task,
			transcript: context.transcript,
			promptStrategy: context.promptStrategy,
			sessionId: context.sessionId,
			requestKey: this.nodeRequestKey(job, node),
			signal,
			onProgress: (event) => this.recordTeamProgress(job.jobId, node.nodeId, executionId, event),
			onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
		});
		if (!result.ok) throw new TeamStepError(result.error);
		if (result.turn !== undefined) return result.turn.text;
		if (result.finalAnswer !== undefined) return result.finalAnswer;
		throw new Error(`team node ${node.nodeId} completed without output`);
	}

	private async runResearchHandoffGate(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string> {
		const payloads = (["A", "B"] as const).map((lane) =>
			this.nodePayload(job, workflowNodeId.researchSynthesis(lane)),
		);
		const receipts: WorkflowHandoffReceipt[] = [];
		for (let index = 0; index < payloads.length; index += 1) {
			const lane = index === 0 ? "A" : "B";
			const handoff = this.handoffs.create({
				jobId: job.jobId,
				source: `research:${lane}`,
				recipient: "chatgpt-writer",
				sequence: index + 1,
				payload: payloads[index]!,
			});
			if (handoff.status !== "delivered") {
				await this.writer.deliverExact({
					sessionId: job.writerConversation.sessionId,
					requestKey: `${job.jobId}:handoff:${handoff.handoffId}`,
					payload: handoff.payload,
					signal,
					onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
				});
			}
			const delivered = this.handoffs.markDelivered(job.jobId, handoff.handoffId, handoff.payloadHash);
			receipts.push(this.handoffReceipt(delivered));
		}
		this.updateHandoffReceipts(job.jobId, receipts);
		return JSON.stringify(receipts);
	}

	private async runWriterImplementation(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const result = await this.writer.runControl({
			sessionId: job.writerConversation.sessionId,
			requestKey: this.nodeRequestKey(job, node),
			job,
			control: createWorkflowControlMessage("START_IMPLEMENTATION", job.jobId),
			signal,
			onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
		});
		if (result.status !== "PR_OPEN") return this.handleWriterNonSuccess(job.jobId, node.nodeId, result);
		this.assertImplementationPr(job, result.pullRequest);
		return JSON.stringify(result.pullRequest);
	}

	private async runReviewGate(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const pr = this.requirePr(job);
		const cycle = this.cycleFromNode(node.nodeId);
		const payloads = (["A", "B"] as const).map((lane) =>
			this.nodePayload(job, workflowNodeId.reviewSynthesis(cycle, lane)),
		);
		const reviews = payloads.map(parseWorkflowReviewResult);
		for (const review of reviews) {
			if (review.reviewedHeadSha !== pr.headSha) throw new Error("review result is bound to a stale PR head");
		}
		const changesRequired = reviews.some((review) => review.verdict === "CHANGES_REQUIRED");
		if (!changesRequired) return JSON.stringify({ verdict: "PASS", reviewedHeadSha: pr.headSha });
		if (cycle >= this.maxReviewCycles) {
			this.block(job.jobId, node.nodeId, {
				kind: "REVIEW_LIMIT_REACHED",
				message: `review cycle limit ${this.maxReviewCycles} reached`,
				nodeId: node.nodeId,
				expectedHeadSha: pr.headSha,
			});
			return undefined;
		}
		const receipts: WorkflowHandoffReceipt[] = [];
		for (let index = 0; index < payloads.length; index += 1) {
			const lane = index === 0 ? "A" : "B";
			const handoff = this.handoffs.create({
				jobId: job.jobId,
				source: `review:${cycle}:${lane}`,
				recipient: "chatgpt-writer",
				sequence: index + 1,
				payload: payloads[index]!,
			});
			if (handoff.status !== "delivered") {
				await this.writer.deliverExact({
					sessionId: job.writerConversation.sessionId,
					requestKey: `${job.jobId}:handoff:${handoff.handoffId}`,
					payload: handoff.payload,
					signal,
					onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
				});
			}
			const delivered = this.handoffs.markDelivered(job.jobId, handoff.handoffId, handoff.payloadHash);
			receipts.push(this.handoffReceipt(delivered));
		}
		this.updateHandoffReceipts(job.jobId, receipts);
		return JSON.stringify({ verdict: "CHANGES_REQUIRED", reviewedHeadSha: pr.headSha });
	}

	private async runWriterRemediation(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const pr = this.requirePr(job);
		const result = await this.writer.runControl({
			sessionId: job.writerConversation.sessionId,
			requestKey: this.nodeRequestKey(job, node),
			job,
			control: createWorkflowControlMessage("APPLY_REVIEWS", job.jobId, pr.headSha),
			signal,
			onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
		});
		if (result.status !== "PR_OPEN") return this.handleWriterNonSuccess(job.jobId, node.nodeId, result);
		this.assertRemediationPr(pr, result.pullRequest);
		return JSON.stringify(result.pullRequest);
	}

	private async runHealth(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const pr = this.requirePr(job);
		const result = await this.writer.runControl({
			sessionId: job.writerConversation.sessionId,
			requestKey: this.nodeRequestKey(job, node),
			job,
			control: createWorkflowControlMessage("CHECK_PR_HEALTH", job.jobId, pr.headSha),
			signal,
			onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
		});
		if (result.status !== "PR_HEALTH") return this.handleWriterNonSuccess(job.jobId, node.nodeId, result);
		this.assertHealth(pr, result);
		const receipt: WorkflowCiReceipt = {
			repository: result.repository,
			number: result.number,
			url: result.url,
			headSha: result.headSha,
			status: result.health,
			checkedAt: new Date().toISOString(),
		};
		if (result.health === "PENDING") {
			const attempt = node.execution?.attempt ?? 1;
			const failure: WorkflowFailure = {
				class: "PROVIDER",
				code: "CI_PENDING",
				message: "required PR checks are still pending",
				retry: "BACKOFF",
				at: receipt.checkedAt,
			};
			const recovery = {
				action: "BACKOFF" as const,
				attempt,
				maxAttempts: this.recoveryPolicy.maxAttempts,
				notBefore: new Date(Date.now() + this.recoveryPolicy.backoffMs).toISOString(),
			};
			this.commit(
				job.jobId,
				{ type: "CI_PENDING", class: "PROGRESS", at: receipt.checkedAt, nodeId: node.nodeId },
				(current) => ({
					...current,
					ciReceipt: receipt,
					graph: this.project(
						recoverWorkflowNode(current.graph, node.nodeId, executionId, "FAILED", failure, recovery),
						undefined,
						current.mergeReceipt,
					),
				}),
			);
			return undefined;
		}
		if (result.health === "FAIL" || result.health === "UNKNOWN") {
			this.block(
				job.jobId,
				node.nodeId,
				{
					kind: result.health === "FAIL" ? "CI_HEALTH_FAILED" : "CI_HEALTH_UNKNOWN",
					message: `PR health is ${result.health}`,
					nodeId: node.nodeId,
					expectedHeadSha: pr.headSha,
				},
				receipt,
			);
			return undefined;
		}
		return JSON.stringify(receipt);
	}

	private async runMerge(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		executionId: string,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		const pr = this.requirePr(job);
		if (job.mergeAuthorization === undefined) throw new Error("merge requires exact authorization");
		const result = await this.writer.runControl({
			sessionId: job.writerConversation.sessionId,
			requestKey: this.nodeRequestKey(job, node),
			job,
			control: createWorkflowControlMessage("MERGE_AUTHORIZED", job.jobId, pr.headSha),
			signal,
			onProviderProgress: (event) => this.recordProviderProgress(job.jobId, node.nodeId, executionId, event),
		});
		if (result.status !== "MERGED") return this.handleWriterNonSuccess(job.jobId, node.nodeId, result);
		if (
			result.headSha !== pr.headSha ||
			result.number !== pr.number ||
			normalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository)
		) {
			throw new Error("merge result does not match authorized PR head");
		}
		return JSON.stringify({
			repository: result.repository,
			number: result.number,
			url: result.url,
			headSha: result.headSha,
			mergedSha: result.mergedSha,
			executorAccountId: "chatgpt-writer",
			mergedAt: new Date().toISOString(),
		});
	}

	private commitNodeResult(
		jobId: string,
		nodeId: string,
		executionId: string,
		result: WorkflowNodeResult,
	): WorkflowJob {
		return this.commit(
			jobId,
			{
				type: "NODE_COMPLETED",
				class: "PROGRESS",
				at: result.completedAt,
				nodeId,
				executionId,
			},
			(job) => {
				let graph = completeWorkflowNode(job.graph, nodeId, executionId, this.outputReceipt(result));
				const node = graph.nodes[nodeId]!;
				let next: WorkflowJob = { ...job, graph };
				if (node.kind === "WRITER_IMPLEMENTATION" || node.kind === "WRITER_REMEDIATION") {
					const pr = JSON.parse(result.payload) as WorkflowPullRequestReceipt;
					const cycle = node.kind === "WRITER_IMPLEMENTATION" ? 1 : job.reviewCycle + 1;
					graph = appendWorkflowNodes(
						graph,
						buildReviewCycleNodes({
							cycle,
							sourceNodeId: nodeId,
							rounds: this.teams.rounds,
							accounts: job.accountRouting.thinkerAccounts,
							synthesizer: job.accountRouting.synthesizerAccount,
						}),
					);
					next = {
						...next,
						graph: setWorkflowGraphStatus(graph, "REVIEW", "RUNNING"),
						pullRequest: pr,
						reviewCycle: cycle,
						ciReceipt: undefined,
						mergeAuthorization: undefined,
					};
				} else if (node.kind === "REVIEW_HANDOFF_GATE") {
					const decision = JSON.parse(result.payload) as { verdict: "PASS" | "CHANGES_REQUIRED" };
					const cycle = this.cycleFromNode(nodeId);
					const followup = decision.verdict === "PASS" ? buildHealthNode(cycle) : buildRemediationNode(cycle);
					if (graph.nodes[followup.nodeId] === undefined) graph = appendWorkflowNodes(graph, [followup]);
					next = {
						...next,
						graph: setWorkflowGraphStatus(graph, decision.verdict === "PASS" ? "HEALTH" : "WRITER", "RUNNING"),
					};
				} else if (node.kind === "PR_HEALTH") {
					const ciReceipt = JSON.parse(result.payload) as WorkflowCiReceipt;
					next = {
						...next,
						ciReceipt,
						graph: setWorkflowGraphStatus(graph, "MERGE", "WAITING_USER"),
						pendingAction: {
							kind: "MERGE_AUTHORIZATION_REQUIRED",
							message: "explicit exact-head merge authorization is required",
							expectedHeadSha: job.pullRequest?.headSha,
						},
					};
				} else if (node.kind === "MERGE") {
					const mergeReceipt = JSON.parse(result.payload) as NonNullable<WorkflowJob["mergeReceipt"]>;
					next = {
						...next,
						mergeReceipt,
						graph: setWorkflowGraphStatus(graph, "DONE", "COMPLETED"),
						pendingAction: undefined,
					};
				}
				return { ...next, graph: this.project(next.graph, next.pendingAction, next.mergeReceipt) };
			},
		);
	}

	private commitReconciledResult(job: WorkflowJob, node: WorkflowGraphNode, result: WorkflowNodeResult): WorkflowJob {
		if (node.state === "COMPLETED") return job;
		if (node.state === "RUNNING" && node.execution !== undefined) {
			return this.commitNodeResult(job.jobId, node.nodeId, node.execution.executionId, result);
		}
		if (node.state !== "READY" && node.state !== "RECOVERING") return job;
		const execution = this.newExecution(node, "reconciliation");
		const started = this.commit(
			job.jobId,
			{
				type: "RESULT_RECONCILED",
				class: "INTERNAL",
				at: new Date().toISOString(),
				nodeId: node.nodeId,
				executionId: execution.executionId,
			},
			(current) => ({
				...current,
				graph: startWorkflowNode(current.graph, node.nodeId, execution),
			}),
		);
		return this.commitNodeResult(started.jobId, node.nodeId, execution.executionId, result);
	}

	private handleExecutionFailure(jobId: string, nodeId: string, executionId: string, error: unknown): WorkflowJob {
		const job = this.status(jobId);
		const node = job.graph.nodes[nodeId];
		if (node?.execution?.executionId !== executionId) return job;
		const failure =
			error instanceof TeamStepError ? classifyTeamFailure(error.detail) : classifyWorkflowFailure(error);
		const recovery = recoveryPlanForFailure(failure, node.execution.attempt, this.recoveryPolicy);
		if (recovery !== undefined && recovery.action !== "USER_ACTION" && recovery.action !== "CODE_FIX") {
			return this.commit(
				jobId,
				{
					type: "RECOVERY_SCHEDULED",
					class: "PROGRESS",
					at: failure.at,
					nodeId,
					executionId,
					message: failure.message,
				},
				(current) => ({
					...current,
					graph: this.project(
						recoverWorkflowNode(current.graph, nodeId, executionId, "FAILED", failure, recovery),
						undefined,
						current.mergeReceipt,
					),
					pendingAction: undefined,
				}),
			);
		}
		const pending: WorkflowPendingAction =
			failure.retry === "CODE_FIX"
				? { kind: "CODE_FIX_REQUIRED", message: failure.message, nodeId }
				: failure.class === "AUTH"
					? { kind: "ACCOUNT_REAUTH_REQUIRED", message: failure.message, nodeId }
					: { kind: "USER_ACTION_REQUIRED", message: failure.message, nodeId };
		return this.failNode(jobId, nodeId, failure, pending);
	}

	private failNode(
		jobId: string,
		nodeId: string,
		failure: WorkflowFailure,
		pendingAction: WorkflowPendingAction,
	): WorkflowJob {
		return this.commit(
			jobId,
			{
				type: "NODE_FAILED",
				class: "ACTION_REQUIRED",
				at: failure.at,
				nodeId,
				message: failure.message,
			},
			(job) => ({
				...job,
				graph: setWorkflowGraphStatus(
					failWorkflowNode(job.graph, nodeId, failure),
					job.graph.nodes[nodeId]?.phase ?? job.graph.phase,
					"BLOCKED",
				),
				pendingAction,
			}),
		);
	}

	private block(
		jobId: string,
		nodeId: string,
		pendingAction: WorkflowPendingAction,
		ciReceipt?: WorkflowCiReceipt,
	): WorkflowJob {
		const failure: WorkflowFailure = {
			class: "USER",
			code: pendingAction.kind,
			message: pendingAction.message,
			retry: "USER_ACTION",
			at: new Date().toISOString(),
		};
		return this.commit(
			jobId,
			{
				type: pendingAction.kind,
				class: "ACTION_REQUIRED",
				at: failure.at,
				nodeId,
				message: failure.message,
			},
			(job) => ({
				...job,
				...(ciReceipt === undefined ? {} : { ciReceipt }),
				graph: setWorkflowGraphStatus(
					failWorkflowNode(job.graph, nodeId, failure),
					job.graph.nodes[nodeId]?.phase ?? job.graph.phase,
					"BLOCKED",
				),
				pendingAction,
			}),
		);
	}

	private handleWriterNonSuccess(jobId: string, nodeId: string, result: WorkflowWriterResult): undefined {
		if (result.status === "UNKNOWN_CONFIRMATION") {
			this.block(jobId, nodeId, {
				kind: "UNKNOWN_CONFIRMATION",
				message: result.message,
				nodeId,
			});
			return undefined;
		}
		if (result.status === "BLOCKED") {
			this.block(jobId, nodeId, {
				kind: "WRITER_BLOCKED",
				message: result.message,
				nodeId,
			});
			return undefined;
		}
		throw new Error(`unexpected writer result ${result.status}`);
	}

	private updateHandoffReceipts(jobId: string, receipts: readonly WorkflowHandoffReceipt[]): void {
		this.commit(jobId, { type: "HANDOFFS_DELIVERED", class: "INTERNAL", at: new Date().toISOString() }, (job) => {
			const byId = new Map(job.handoffReceipts.map((receipt) => [receipt.handoffId, receipt]));
			for (const receipt of receipts) byId.set(receipt.handoffId, receipt);
			return {
				...job,
				handoffReceipts: [...byId.values()].sort(
					(a, b) => a.source.localeCompare(b.source) || a.sequence - b.sequence,
				),
			};
		});
	}

	private heartbeat(jobId: string, nodeId: string, executionId: string): void {
		try {
			const current = this.status(jobId);
			const node = current.graph.nodes[nodeId];
			if (
				node?.execution?.executionId !== executionId ||
				(node.state !== "RUNNING" && node.state !== "WAITING_USER")
			) {
				return;
			}
			const now = new Date();
			this.jobs.update(jobId, current.revision, (job) => ({
				...job,
				revision: job.revision + 1,
				updatedAt: now.toISOString(),
				graph: updateWorkflowExecution(job.graph, nodeId, executionId, (execution) => ({
					...execution,
					heartbeatAt: now.toISOString(),
					leaseUntil: new Date(now.getTime() + this.executionLeaseMs).toISOString(),
				})),
			}));
		} catch {
			// A newer durable completion or recovery transition wins the race.
		}
	}

	private recordTeamProgress(jobId: string, nodeId: string, executionId: string, event: TeamProgressEvent): void {
		try {
			const current = this.status(jobId);
			if (current.graph.nodes[nodeId]?.execution?.executionId !== executionId) return;
			this.jobs.update(jobId, current.revision, (job) => ({
				...job,
				revision: job.revision + 1,
				updatedAt: event.at,
				graph: updateWorkflowExecution(job.graph, nodeId, executionId, (execution) => ({
					...execution,
					providerState: event.status === "completed" ? "STREAMING" : "THINKING",
					lastProviderEventAt: event.at,
					...(event.status === "completed" ? { lastMeaningfulProgressAt: event.at } : {}),
				})),
			}));
		} catch {
			// Progress is diagnostic; durable completion or recovery wins races.
		}
	}

	private recordProviderProgress(
		jobId: string,
		nodeId: string,
		executionId: string,
		event: ProviderProgressEvent,
	): void {
		try {
			const current = this.status(jobId);
			if (current.graph.nodes[nodeId]?.execution?.executionId !== executionId) return;
			this.jobs.update(jobId, current.revision, (job) => ({
				...job,
				revision: job.revision + 1,
				updatedAt: event.at,
				graph: updateWorkflowExecution(job.graph, nodeId, executionId, (execution) => ({
					...execution,
					providerState: event.kind === "generation_started" ? "THINKING" : "STREAMING",
					lastProviderEventAt: event.at,
					lastMeaningfulProgressAt: event.at,
				})),
			}));
		} catch {
			// Semantic progress is diagnostic; durable completion/recovery wins races.
		}
	}

	private inputForNode(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		graph: WorkflowGraphSnapshot,
	): WorkflowNodeInputReceipt {
		const dependencies = this.dependencyHashes(node, graph);
		if (node.kind === "TEAM_MEMBER" || node.kind === "TEAM_SYNTHESIS") {
			const context = this.teamNodeContext({ ...job, graph }, node);
			return createTeamStepInputReceipt({
				nodeId: node.nodeId,
				plan: context.plan,
				step: context.step,
				task: context.task,
				transcript: context.transcript,
				promptStrategy: context.promptStrategy,
				dependencyOutputHashes: dependencies,
				bindings: {
					repository: job.repository,
					baseRevision: job.baseRevision,
					sessionId: context.sessionId,
					taskHash: hashWorkflowGraphValue(context.task),
					stepId: context.step.stepId,
					accountId: context.step.accountId,
					...(job.pullRequest === undefined
						? {}
						: {
								headSha: job.pullRequest.headSha,
								reviewCycle: job.reviewCycle,
							}),
				},
			});
		}
		const bindings: Record<string, string | number | boolean> = {
			repository: job.repository,
			baseRevision: job.baseRevision,
			objectiveHash: hashWorkflowGraphValue(job.objective),
			writerSessionId: job.writerConversation.sessionId,
		};
		if (job.pullRequest !== undefined) {
			Object.assign(bindings, {
				prNumber: job.pullRequest.number,
				headSha: job.pullRequest.headSha,
				reviewCycle: job.reviewCycle,
			});
		}
		return createWorkflowNodeInputReceipt(node.nodeId, dependencies, bindings);
	}

	private teamNodeContext(
		job: WorkflowJob,
		node: WorkflowGraphNode,
	): {
		plan: ReturnType<typeof buildTeamPlan>;
		step: TeamPlanStep;
		task: string;
		transcript: readonly TeamTurn[];
		promptStrategy: TeamPromptStrategyId;
		sessionId: string;
	} {
		const parsed = this.parseTeamNode(node.nodeId);
		const plan = buildTeamPlan({
			accounts: job.accountRouting.thinkerAccounts,
			rounds: this.teams.rounds,
			synthesize: true,
			synthesizer: job.accountRouting.synthesizerAccount,
		});
		const step =
			parsed.kind === "synthesis"
				? plan.steps.find((candidate) => candidate.kind === "synthesis")
				: plan.steps.find(
						(candidate) =>
							candidate.kind === "member" &&
							candidate.round === parsed.round &&
							candidate.member === parsed.member,
					);
		if (step === undefined) throw new Error(`workflow node ${node.nodeId} does not map to the current team plan`);
		const task =
			parsed.phase === "research"
				? this.prompts.research(job, parsed.lane)
				: this.prompts.review({ ...job, pullRequest: this.requirePr(job) }, parsed.lane);
		const sessionId = this.teamSession(job.ownerSessionId, job.jobId, parsed.phase, parsed.lane);
		const transcript: TeamTurn[] = [];
		for (const planStep of plan.steps) {
			if (planStep.stepId === step.stepId) break;
			if (planStep.kind !== "member") continue;
			const priorNodeId =
				parsed.phase === "research"
					? workflowNodeId.researchMember(parsed.lane, planStep.round, planStep.member)
					: workflowNodeId.reviewMember(parsed.cycle!, parsed.lane, planStep.round, planStep.member);
			const prior = job.graph.nodes[priorNodeId];
			if (prior?.state !== "COMPLETED" || prior.output === undefined) continue;
			const payload = this.results.get(job.jobId, prior.output.resultId)?.payload;
			if (payload === undefined) throw new Error(`workflow node result ${prior.output.resultId} is missing`);
			transcript.push({
				round: planStep.round,
				accountId: planStep.accountId,
				provider: getAccountDefinition(planStep.accountId).provider,
				text: payload,
			});
		}
		return {
			plan,
			step,
			task,
			transcript,
			promptStrategy: parsed.phase === "research" ? "workflow-research" : "workflow-review",
			sessionId,
		};
	}

	private parseTeamNode(nodeId: string): {
		phase: "research" | "review";
		lane: WorkflowLane;
		cycle?: number;
		kind: "member" | "synthesis";
		round?: number;
		member?: number;
	} {
		const research = nodeId.match(/^research:([AB]):(?:(?:round:(\d+):member:(\d+))|(synthesis))$/u);
		if (research) {
			return {
				phase: "research",
				lane: research[1] as WorkflowLane,
				kind: research[4] ? "synthesis" : "member",
				...(research[2] ? { round: Number(research[2]), member: Number(research[3]) } : {}),
			};
		}
		const review = nodeId.match(/^review:cycle:(\d+):([AB]):(?:(?:round:(\d+):member:(\d+))|(synthesis))$/u);
		if (review) {
			return {
				phase: "review",
				cycle: Number(review[1]),
				lane: review[2] as WorkflowLane,
				kind: review[5] ? "synthesis" : "member",
				...(review[3] ? { round: Number(review[3]), member: Number(review[4]) } : {}),
			};
		}
		throw new Error(`workflow node ${nodeId} is not a team node`);
	}

	private nodeRequestKey(job: WorkflowJob, node: WorkflowGraphNode): string {
		if (node.input === undefined) throw new Error(`workflow node ${node.nodeId} has no exact input receipt`);
		return `${job.jobId}:${node.nodeId}:${node.input.inputHash}`;
	}

	private newExecution(node: WorkflowGraphNode, ownerInstanceId: string): WorkflowExecutionRecord {
		const now = new Date();
		return {
			executionId: randomBytes(16).toString("hex"),
			attempt: node.state === "RECOVERING" ? (node.recovery?.attempt ?? (node.execution?.attempt ?? 0) + 1) : 1,
			state: "ACTIVE",
			ownerInstanceId,
			startedAt: now.toISOString(),
			heartbeatAt: now.toISOString(),
			leaseUntil: new Date(now.getTime() + this.executionLeaseMs).toISOString(),
			providerState: "NAVIGATING",
			lastProviderEventAt: now.toISOString(),
			lastMeaningfulProgressAt: now.toISOString(),
		};
	}

	private commit(
		jobId: string,
		event: WorkflowEventRecord,
		mutate: (current: WorkflowJob) => WorkflowJob,
	): WorkflowJob {
		const current = this.status(jobId);
		const mutated = mutate(current);
		const graph = { ...mutated.graph, eventSeq: current.graph.eventSeq + 1 };
		const next: WorkflowJob = {
			...mutated,
			graph,
			revision: current.revision + 1,
			lastEvent: event,
			updatedAt: event.at,
		};
		const saved = this.jobs.update(jobId, current.revision, () => next);
		try {
			this.journal?.append(saved, event);
		} catch {
			// Snapshot is authoritative. A diagnostic journal gap never rolls correctness back.
		}
		this.events?.publish(saved, event);
		return saved;
	}

	private project(
		graph: WorkflowGraphSnapshot,
		pendingAction: WorkflowPendingAction | undefined,
		mergeReceipt: WorkflowJob["mergeReceipt"],
	): WorkflowGraphSnapshot {
		if (graph.lifecycle === "CANCELLED") return graph;
		if (mergeReceipt !== undefined) return { ...graph, phase: "DONE", lifecycle: "COMPLETED" };
		if (pendingAction?.kind === "MERGE_AUTHORIZATION_REQUIRED")
			return { ...graph, phase: "MERGE", lifecycle: "WAITING_USER" };
		if (pendingAction !== undefined || Object.values(graph.nodes).some((node) => node.state === "FAILED")) {
			return { ...graph, lifecycle: "BLOCKED" };
		}
		const waitingForUser = Object.values(graph.nodes).find((node) => node.state === "WAITING_USER");
		if (waitingForUser !== undefined) {
			return { ...graph, phase: waitingForUser.phase, lifecycle: "WAITING_USER" };
		}
		const recovering = Object.values(graph.nodes).find((node) => node.state === "RECOVERING");
		if (recovering !== undefined) return { ...graph, phase: recovering.phase, lifecycle: "RECOVERING" };
		const phaseOrder = ["RESEARCH", "WRITER", "REVIEW", "HEALTH", "MERGE"] as const;
		for (const phase of phaseOrder) {
			if (
				Object.values(graph.nodes).some(
					(node) => node.phase === phase && node.state !== "COMPLETED" && node.state !== "CANCELLED",
				)
			) {
				return { ...graph, phase, lifecycle: "RUNNING" };
			}
		}
		return graph;
	}

	private dependencyHashes(node: WorkflowGraphNode, graph: WorkflowGraphSnapshot): Record<string, string> {
		return Object.fromEntries(
			node.dependencies.map((dependencyId) => {
				const output = graph.nodes[dependencyId]?.output;
				if (output === undefined) throw new Error(`workflow dependency ${dependencyId} has no output receipt`);
				return [dependencyId, output.outputHash];
			}),
		);
	}

	private nodePayload(job: WorkflowJob, nodeId: string): string {
		const output = job.graph.nodes[nodeId]?.output;
		if (output === undefined) throw new Error(`workflow node ${nodeId} has no output`);
		const result = this.results.get(job.jobId, output.resultId);
		if (result === undefined || result.outputHash !== output.outputHash)
			throw new Error(`workflow node ${nodeId} exact result is unavailable`);
		return result.payload;
	}

	private outputReceipt(result: WorkflowNodeResult) {
		return {
			resultId: result.resultId,
			outputHash: result.outputHash,
			completedAt: result.completedAt,
		};
	}

	private handoffReceipt(handoff: WorkflowHandoff): WorkflowHandoffReceipt {
		return {
			handoffId: handoff.handoffId,
			source: handoff.source,
			recipient: handoff.recipient,
			sequence: handoff.sequence,
			payloadHash: handoff.payloadHash,
			status: handoff.status,
		};
	}

	private assertImplementationPr(job: WorkflowJob, pr: WorkflowPullRequestReceipt): void {
		if (
			normalizeGitHubRepository(pr.repository) !== normalizeGitHubRepository(job.repository) ||
			pr.base !== WORKFLOW_BASE_BRANCH ||
			pr.head !== `internet-workflow/${job.jobId}`
		) {
			throw new Error("writer PR receipt violates workflow repository/base/branch authority");
		}
	}

	private assertRemediationPr(current: WorkflowPullRequestReceipt, next: WorkflowPullRequestReceipt): void {
		if (
			normalizeGitHubRepository(next.repository) !== normalizeGitHubRepository(current.repository) ||
			next.number !== current.number ||
			next.url !== current.url ||
			next.base !== current.base ||
			next.head !== current.head
		) {
			throw new Error("writer remediation must update exactly the existing workflow PR");
		}
	}

	private assertHealth(
		pr: WorkflowPullRequestReceipt,
		result: Extract<WorkflowWriterResult, { status: "PR_HEALTH" }>,
	): void {
		if (
			normalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository) ||
			result.number !== pr.number ||
			result.url !== pr.url ||
			result.headSha !== pr.headSha
		) {
			throw new Error("PR health result does not match exact workflow PR head");
		}
	}

	private requirePr(job: WorkflowJob): WorkflowPullRequestReceipt {
		if (job.pullRequest === undefined) throw new Error("workflow operation requires a persisted PR");
		return job.pullRequest;
	}

	private cycleFromNode(nodeId: string): number {
		const match = nodeId.match(/:cycle:(\d+):/u);
		if (!match) throw new Error(`workflow node ${nodeId} has no review cycle`);
		return Number(match[1]);
	}

	private teamSession(
		ownerSessionId: string,
		jobId: string,
		phase: "research" | "review",
		lane: WorkflowLane,
	): string {
		return `${ownerSessionId}:workflow:${jobId}:${phase}:${lane}`;
	}
}

class TeamStepError extends Error {
	readonly detail: TeamFailureDetail;

	constructor(detail: TeamFailureDetail) {
		super(detail.message);
		this.name = "TeamStepError";
		this.detail = detail;
	}
}
