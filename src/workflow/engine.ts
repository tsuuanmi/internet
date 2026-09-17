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
	buildInitialWorkflowGraph,
	buildRemediationNode,
	buildReviewCycleNodes,
	createTeamStepInputReceipt,
	createWorkflowNodeInputReceipt,
	hashWorkflowGraphValue,
} from "#internet/workflow/graph-builder";
import {
	appendWorkflowNodes,
	cancelWorkflowGraph,
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
	type WorkflowEventRecord,
	type WorkflowHandoffReceipt,
	type WorkflowJob,
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
		if (input.jobId !== undefined && !/^[0-9a-f]{32}$/u.test(input.jobId))
			throw new Error("workflow job id must be 32 lowercase hex characters");
		const jobId = input.jobId ?? randomBytes(16).toString("hex");
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
			version: 3,
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
				sessionId: this.writerSession(input.ownerSessionId, jobId),
				accountId: "chatgpt-writer",
			},
			reviewCycle: 0,
			createdAt: at,
			updatedAt: at,
		});
	}

	status(jobId: string): WorkflowJob {
		return this.mustJob(jobId);
	}

	continue(jobId: string): WorkflowJob {
		return this.update(jobId, (current) => {
			if (workflowJobIsTerminal(current)) throw new Error(`workflow job ${jobId} is already terminal`);
			if (current.graph.lifecycle !== "BLOCKED" && current.graph.lifecycle !== "RECOVERING") {
				throw new Error(`workflow job ${jobId} has no explicit recovery path`);
			}
			const blocked = Object.values(current.graph.nodes).filter((node) => node.state === "FAILED");
			if (blocked.length === 0 && current.graph.lifecycle === "BLOCKED") {
				throw new Error(`workflow job ${jobId} is blocked without a recoverable failed node`);
			}
			let graph = current.graph;
			for (const node of blocked) {
				const recovery = recoveryPlanForFailure(node.failure, node.recovery?.attempt ?? 0, this.recoveryPolicy);
				if (recovery === undefined) throw new Error(`workflow node ${node.nodeId} has no configured recovery path`);
				graph = recoverWorkflowNode(graph, node.nodeId, recovery);
			}
			return {
				...current,
				graph: promoteReadyWorkflowNodes(graph),
				pendingAction: undefined,
				lastEvent: this.event("INTERNAL", "WORKFLOW_CONTINUED", "workflow recovery resumed"),
			};
		});
	}

	cancel(jobId: string): WorkflowJob {
		return this.update(jobId, (current) => {
			if (workflowJobIsTerminal(current)) return current;
			return {
				...current,
				graph: cancelWorkflowGraph(current.graph),
				pendingAction: undefined,
				lastEvent: this.event("INTERNAL", "WORKFLOW_CANCELLED", "workflow cancelled"),
			};
		});
	}

	advance(jobId: string): WorkflowJob {
		return this.update(jobId, (current) => this.advanceCurrent(current));
	}

	runnableNodeIds(jobId: string, at: number = Date.now()): readonly string[] {
		const job = this.mustJob(jobId);
		return Object.values(job.graph.nodes)
			.filter((node) => node.state === "READY" || (node.state === "RECOVERING" && this.recoveryReady(node, at)))
			.map((node) => node.nodeId)
			.sort();
	}

	nextRecoveryAt(jobId: string): string | undefined {
		const job = this.mustJob(jobId);
		return Object.values(job.graph.nodes)
			.filter((node) => node.state === "RECOVERING" && node.recovery?.notBefore !== undefined)
			.map((node) => node.recovery!.notBefore!)
			.sort()[0];
	}

	async executeNode(
		jobId: string,
		nodeId: string,
		ownerInstanceId: string,
		signal?: AbortSignal,
	): Promise<WorkflowJob> {
		let job = this.mustJob(jobId);
		const node = job.graph.nodes[nodeId];
		if (node === undefined) throw new Error(`workflow node ${nodeId} does not exist`);
		if (node.state !== "READY" && node.state !== "RECOVERING") return job;
		const reusable = this.results.get(node.input.inputHash);
		if (reusable !== undefined && reusable.nodeKind === node.kind) {
			return this.completeFromStoredResult(jobId, nodeId, reusable, "reused exact stored node result");
		}

		const execution = this.startExecution(jobId, nodeId, ownerInstanceId);
		job = execution.job;
		try {
			const result = await this.executeNodeWork(job, job.graph.nodes[nodeId]!, execution.execution, signal);
			return this.commitNodeResult(jobId, nodeId, result);
		} catch (error) {
			return this.failNode(jobId, nodeId, error);
		}
	}

	blockSchedulerFailure(jobId: string, error: unknown): WorkflowJob {
		return this.update(jobId, (current) => ({
			...current,
			graph: setWorkflowGraphStatus(current.graph, current.graph.phase, "BLOCKED"),
			pendingAction: {
				kind: "CODE_FIX_REQUIRED",
				message: `workflow scheduler failed: ${error instanceof Error ? error.message : String(error)}`,
			},
			lastEvent: this.event(
				"ACTION_REQUIRED",
				"SCHEDULER_FAILURE",
				error instanceof Error ? error.message : String(error),
			),
		}));
	}

	/** Reconcile orphaned execution ownership after process restart. */
	reconcile(jobId: string, ownerInstanceId: string, at: number = Date.now()): WorkflowJob {
		return this.update(jobId, (current) => {
			let graph = current.graph;
			let changed = false;
			for (const node of Object.values(graph.nodes)) {
				if (node.state !== "RUNNING" || node.execution === undefined) continue;
				if (node.execution.ownerInstanceId === ownerInstanceId) continue;
				if (!executionLeaseExpired(node.execution, at)) continue;
				const reusable = this.results.get(node.input.inputHash);
				if (reusable !== undefined && reusable.nodeKind === node.kind) {
					graph = completeWorkflowNode(
						graph,
						node.nodeId,
						reusable.outputHash,
						reusable.summary,
						reusable.completedAt,
					);
					changed = true;
					continue;
				}
				const failure: WorkflowFailure = {
					class: "ORCHESTRATION",
					code: "ORPHANED_EXECUTION",
					message: `execution ${node.execution.executionId} lost its owner before completion`,
					retry: "retry_same_input",
				};
				const recovery = recoveryPlanForFailure(failure, node.recovery?.attempt ?? 0, this.recoveryPolicy);
				graph =
					recovery === undefined
						? failWorkflowNode(graph, node.nodeId, failure)
						: recoverWorkflowNode(failWorkflowNode(graph, node.nodeId, failure), node.nodeId, recovery);
				changed = true;
			}
			if (!changed) return current;
			return {
				...current,
				graph: promoteReadyWorkflowNodes(graph),
				lastEvent: this.event("INTERNAL", "EXECUTION_RECONCILED", "orphaned workflow execution reconciled"),
			};
		});
	}

	private advanceCurrent(current: WorkflowJob): WorkflowJob {
		if (workflowJobIsTerminal(current) || current.graph.lifecycle === "BLOCKED") return current;
		let graph = promoteReadyWorkflowNodes(current.graph);
		let next: WorkflowJob = graph === current.graph ? current : { ...current, graph };

		const researchGate = graph.nodes[workflowNodeId.researchHandoff()];
		if (researchGate?.state === "READY") {
			const researchA = this.mustNodeOutput(graph, workflowNodeId.researchSynthesis("A"));
			const researchB = this.mustNodeOutput(graph, workflowNodeId.researchSynthesis("B"));
			const handoff = this.handoffs.create({
				jobId: current.jobId,
				sourceNodeIds: [researchA.nodeId, researchB.nodeId],
				recipient: "chatgpt-writer",
				sequence: current.handoffReceipts.length + 1,
				payload: this.researchPayload(current, researchA, researchB),
			});
			const receipt = this.handoffReceipt(handoff);
			graph = completeWorkflowNode(
				graph,
				researchGate.nodeId,
				handoff.payloadHash,
				"research handoff persisted",
				handoff.createdAt,
			);
			next = {
				...next,
				graph,
				handoffReceipts: [...next.handoffReceipts, receipt],
				lastEvent: this.event("INTERNAL", "RESEARCH_HANDOFF_CREATED", `research handoff ${handoff.handoffId}`),
			};
		}

		const reviewGate = Object.values(graph.nodes).find(
			(node) => node.kind === "REVIEW_HANDOFF_GATE" && node.state === "READY",
		);
		if (reviewGate !== undefined) return this.resolveReviewGate(next, reviewGate);

		return next;
	}

	private async executeNodeWork(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		execution: WorkflowExecutionRecord,
		signal?: AbortSignal,
	): Promise<WorkflowNodeResult> {
		if (node.kind === "TEAM_MEMBER" || node.kind === "TEAM_SYNTHESIS") {
			return this.executeTeamNode(job, node, execution, signal);
		}
		if (node.kind === "WRITER_IMPLEMENTATION" || node.kind === "WRITER_REMEDIATION") {
			return this.executeWriterNode(job, node, execution, signal);
		}
		throw new Error(`workflow node ${node.nodeId} is not directly executable`);
	}

	private async executeTeamNode(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		execution: WorkflowExecutionRecord,
		signal?: AbortSignal,
	): Promise<WorkflowNodeResult> {
		const step = this.teamStep(node);
		const context = await this.teamPromptContext(job, node);
		const finalSystem = this.prompts.system(step.phase, context.lane);
		const finalPrompt = this.prompts.prompt(step, context);
		if (node.input.bindings?.prompt !== undefined) {
			const expected = createTeamStepInputReceipt({
				nodeId: node.nodeId,
				bindings: node.input.bindings,
				dependencyOutputHashes: node.input.dependencyOutputHashes,
				finalSystem,
				finalPrompt,
			});
			if (expected.inputHash !== node.input.inputHash) {
				throw new Error(`workflow node ${node.nodeId} exact input receipt is stale`);
			}
		}
		let providerState: string | undefined;
		let lastMeaningfulProgressAt: string | undefined;
		const result = await this.teams.runStep({
			jobId: job.jobId,
			step,
			system: finalSystem,
			prompt: finalPrompt,
			signal,
			onProgress: (event) => {
				const semantic = this.mapTeamProgress(event);
				providerState = semantic.providerState ?? providerState;
				if (semantic.meaningful) lastMeaningfulProgressAt = semantic.at;
				this.touchExecution(
					job.jobId,
					node.nodeId,
					execution.executionId,
					semantic.providerState,
					semantic.meaningful,
					semantic.at,
				);
			},
		});
		if (!result.ok) throw result.failure;
		const completedAt = new Date().toISOString();
		const summary = result.finalAnswer ?? result.turn?.text ?? "team step completed";
		const output = result.finalAnswer ?? result.turn?.text ?? "";
		return {
			schema: "@tsuuanmi/internet-workflow-node-result",
			version: 1,
			resultId: this.results.idFor(node.input.inputHash),
			jobId: job.jobId,
			nodeId: node.nodeId,
			nodeKind: node.kind,
			inputHash: node.input.inputHash,
			outputHash: hashWorkflowGraphValue(output),
			summary,
			output,
			completedAt,
		};
	}

	private async executeWriterNode(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		execution: WorkflowExecutionRecord,
		signal?: AbortSignal,
	): Promise<WorkflowNodeResult> {
		const control = node.input.bindings?.control;
		if (control === undefined) throw new Error(`workflow writer node ${node.nodeId} is missing trusted control`);
		let providerState: string | undefined;
		let lastMeaningfulProgressAt: string | undefined;
		const result = await this.writer.runControl({
			jobId: job.jobId,
			conversationSessionId: job.writerConversation.sessionId,
			control,
			...(node.input.bindings?.handoffId === undefined ? {} : { handoffId: node.input.bindings.handoffId }),
			signal,
			onProgress: (event) => {
				providerState = event.providerState ?? providerState;
				if (event.meaningful) lastMeaningfulProgressAt = event.at;
				this.touchExecution(
					job.jobId,
					node.nodeId,
					execution.executionId,
					event.providerState,
					event.meaningful,
					event.at,
				);
			},
		});
		return this.writerNodeResult(job, node, result);
	}

	private resolveReviewGate(job: WorkflowJob, node: WorkflowGraphNode): WorkflowJob {
		const cycle = node.reviewCycle;
		if (cycle === undefined) throw new Error(`review gate ${node.nodeId} is missing review cycle`);
		const reviewA = this.mustNodeOutput(job.graph, workflowNodeId.reviewSynthesis(cycle, "A"));
		const reviewB = this.mustNodeOutput(job.graph, workflowNodeId.reviewSynthesis(cycle, "B"));
		const findingsA = parseWorkflowReviewResult(reviewA.output ?? "");
		const findingsB = parseWorkflowReviewResult(reviewB.output ?? "");
		const allPass = findingsA.verdict === "PASS" && findingsB.verdict === "PASS";
		if (allPass) {
			const graph = completeWorkflowNode(
				job.graph,
				node.nodeId,
				hashWorkflowGraphValue("PASS"),
				"review passed",
				new Date().toISOString(),
			);
			return {
				...job,
				graph: setWorkflowGraphStatus(graph, "DONE", "COMPLETED"),
				pendingAction: undefined,
				lastEvent: this.event("PROGRESS", "WORKFLOW_COMPLETED", "exact PR head passed all review lanes"),
			};
		}

		if (cycle >= this.maxReviewCycles) {
			return {
				...job,
				graph: setWorkflowGraphStatus(job.graph, "REVIEW", "BLOCKED"),
				pendingAction: {
					kind: "REVIEW_LIMIT_REACHED",
					message: `review cycle limit ${this.maxReviewCycles} reached; inspect the latest exact-head findings before continuing`,
					nodeId: node.nodeId,
					expectedHeadSha: job.pullRequest?.headSha,
				},
				lastEvent: this.event("ACTION_REQUIRED", "REVIEW_LIMIT_REACHED", "review cycle limit reached", node.nodeId),
			};
		}

		const control = this.remediationControl(job, cycle, reviewA.output ?? "", reviewB.output ?? "");
		let graph = completeWorkflowNode(
			job.graph,
			node.nodeId,
			hashWorkflowGraphValue("CHANGES_REQUIRED"),
			"review changes required",
			new Date().toISOString(),
		);
		const remediation = buildRemediationNode({
			cycle,
			control,
			expectedHeadSha: job.pullRequest?.headSha ?? "",
			reviewOutputHashes: [reviewA.outputHash, reviewB.outputHash],
		});
		graph = appendWorkflowNodes(graph, [remediation]);
		return {
			...job,
			graph: promoteReadyWorkflowNodes(graph),
			lastEvent: this.event(
				"PROGRESS",
				"REMEDIATION_SCHEDULED",
				`review cycle ${cycle} requested remediation`,
				remediation.nodeId,
			),
		};
	}

	private writerNodeResult(
		job: WorkflowJob,
		node: WorkflowGraphNode,
		result: WorkflowWriterResult,
	): WorkflowNodeResult {
		if (result.status === "BLOCKED") throw new Error(result.message);
		const completedAt = new Date().toISOString();
		const output = JSON.stringify(result);
		return {
			schema: "@tsuuanmi/internet-workflow-node-result",
			version: 1,
			resultId: this.results.idFor(node.input.inputHash),
			jobId: job.jobId,
			nodeId: node.nodeId,
			nodeKind: node.kind,
			inputHash: node.input.inputHash,
			outputHash: hashWorkflowGraphValue(output),
			summary: result.message ?? result.status,
			output,
			completedAt,
		};
	}

	private completeFromStoredResult(
		jobId: string,
		nodeId: string,
		result: WorkflowNodeResult,
		summary: string,
	): WorkflowJob {
		return this.update(jobId, (current) => ({
			...current,
			graph: completeWorkflowNode(current.graph, nodeId, result.outputHash, summary, result.completedAt),
			lastEvent: this.event("INTERNAL", "NODE_RESULT_REUSED", summary, nodeId),
		}));
	}

	private commitNodeResult(jobId: string, nodeId: string, result: WorkflowNodeResult): WorkflowJob {
		this.results.put(result);
		return this.update(jobId, (current) => {
			let graph = completeWorkflowNode(current.graph, nodeId, result.outputHash, result.summary, result.completedAt);
			let next: WorkflowJob = {
				...current,
				graph,
				lastEvent: this.event("PROGRESS", "NODE_COMPLETED", result.summary, nodeId),
			};
			const node = graph.nodes[nodeId]!;
			if (node.kind === "WRITER_IMPLEMENTATION" || node.kind === "WRITER_REMEDIATION") {
				const writer = this.writerResult(result.output ?? "");
				if (writer.status === "PR_OPEN") {
					next = {
						...next,
						pullRequest: writer.pullRequest,
						writerConversation: {
							...next.writerConversation,
							...(writer.conversationUrl === undefined ? {} : { url: writer.conversationUrl }),
						},
					};
					const nextCycle = next.reviewCycle + 1;
					graph = appendWorkflowNodes(
						next.graph,
						buildReviewCycleNodes({
							cycle: nextCycle,
							pullRequest: writer.pullRequest,
							rounds: this.teams.rounds,
							accounts: DEFAULT_TEAM_ACCOUNTS,
							synthesizer: DEFAULT_TEAM_SYNTHESIZER,
						}),
					);
					next = { ...next, graph: promoteReadyWorkflowNodes(graph), reviewCycle: nextCycle };
				}
			}
			return this.advanceCurrent(next);
		});
	}

	private failNode(jobId: string, nodeId: string, error: unknown): WorkflowJob {
		return this.update(jobId, (current) => {
			const node = current.graph.nodes[nodeId];
			if (node === undefined) return current;
			const failure = classifyWorkflowFailure(error);
			const retry = recoveryPlanForFailure(failure, node.recovery?.attempt ?? 0, this.recoveryPolicy);
			let graph = failWorkflowNode(current.graph, nodeId, failure);
			let pendingAction: WorkflowPendingAction | undefined;
			if (retry !== undefined) graph = recoverWorkflowNode(graph, nodeId, retry);
			else {
				graph = setWorkflowGraphStatus(graph, graph.phase, "BLOCKED");
				pendingAction = this.pendingActionForFailure(nodeId, failure, current.pullRequest?.headSha);
			}
			return {
				...current,
				graph,
				pendingAction,
				lastEvent: this.event(
					pendingAction === undefined ? "PROGRESS" : "ACTION_REQUIRED",
					pendingAction === undefined ? "NODE_RECOVERY_SCHEDULED" : "NODE_BLOCKED",
					failure.message,
					nodeId,
				),
			};
		});
	}

	private startExecution(
		jobId: string,
		nodeId: string,
		ownerInstanceId: string,
	): { job: WorkflowJob; execution: WorkflowExecutionRecord } {
		const startedAt = new Date().toISOString();
		const executionId = randomBytes(16).toString("hex");
		let execution!: WorkflowExecutionRecord;
		const job = this.update(jobId, (current) => {
			const node = current.graph.nodes[nodeId];
			if (node === undefined) throw new Error(`workflow node ${nodeId} does not exist`);
			const attempt = (node.execution?.attempt ?? 0) + 1;
			execution = {
				executionId,
				attempt,
				ownerInstanceId,
				startedAt,
				heartbeatAt: startedAt,
				leaseUntil: new Date(Date.parse(startedAt) + this.executionLeaseMs).toISOString(),
				state: "ACTIVE",
			};
			return {
				...current,
				graph: startWorkflowNode(current.graph, nodeId, execution),
				lastEvent: this.event("PROGRESS", "NODE_STARTED", `execution ${executionId} started`, nodeId, executionId),
			};
		});
		return { job, execution };
	}

	private touchExecution(
		jobId: string,
		nodeId: string,
		executionId: string,
		providerState: string | undefined,
		meaningful: boolean,
		at: string,
	): void {
		this.update(jobId, (current) => {
			const node = current.graph.nodes[nodeId];
			if (node?.execution?.executionId !== executionId) return current;
			const execution: WorkflowExecutionRecord = {
				...node.execution,
				heartbeatAt: at,
				leaseUntil: new Date(Date.parse(at) + this.executionLeaseMs).toISOString(),
				...(providerState === undefined ? {} : { providerState }),
				...(meaningful ? { lastMeaningfulProgressAt: at } : {}),
			};
			return { ...current, graph: updateWorkflowExecution(current.graph, nodeId, execution) };
		});
	}

	private recoveryReady(node: WorkflowGraphNode, at: number): boolean {
		const notBefore = node.recovery?.notBefore;
		return notBefore === undefined || Date.parse(notBefore) <= at;
	}

	private mustJob(jobId: string): WorkflowJob {
		const job = this.jobs.get(jobId);
		if (job === undefined) throw new Error(`workflow job ${jobId} does not exist`);
		return job;
	}

	private update(jobId: string, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob {
		const current = this.mustJob(jobId);
		const candidate = mutate(current);
		if (candidate === current) return current;
		return this.jobs.update(jobId, current.revision, (fresh) => ({
			...candidate,
			revision: fresh.revision + 1,
			updatedAt: new Date().toISOString(),
		}));
	}

	private event(
		className: WorkflowEventRecord["class"],
		type: string,
		message?: string,
		nodeId?: string,
		executionId?: string,
	): WorkflowEventRecord {
		return {
			type,
			class: className,
			at: new Date().toISOString(),
			...(message === undefined ? {} : { message }),
			...(nodeId === undefined ? {} : { nodeId }),
			...(executionId === undefined ? {} : { executionId }),
		};
	}

	private emit(job: WorkflowJob): void {
		const event = job.lastEvent;
		if (event === undefined) return;
		this.journal?.append(job.jobId, event);
		this.events?.emit({
			jobId: job.jobId,
			ownerSessionId: job.ownerSessionId,
			phase: job.graph.phase,
			lifecycle: job.graph.lifecycle,
			event,
		});
	}

	private writerSession(ownerSessionId: string, jobId: string): string {
		return `${ownerSessionId}:workflow:${jobId}:writer`;
	}

	private teamSession(ownerSessionId: string, jobId: string, phase: string, lane: string): string {
		return `${ownerSessionId}:workflow:${jobId}:${phase}:${lane}`;
	}

	private teamStep(node: WorkflowGraphNode): TeamPlanStep {
		const input = node.input.bindings;
		if (
			input?.accountId === undefined ||
			input.phase === undefined ||
			input.lane === undefined ||
			input.sessionId === undefined ||
			input.round === undefined
		) {
			throw new Error(`workflow node ${node.nodeId} is missing team bindings`);
		}
		return {
			stepId: node.nodeId,
			kind: node.kind === "TEAM_SYNTHESIS" ? "synthesis" : "turn",
			phase: input.phase,
			lane: input.lane,
			accountId: input.accountId,
			sessionId: input.sessionId,
			round: input.round,
			memberIndex: input.memberIndex,
			strategy: input.strategy,
		};
	}

	private async teamPromptContext(
		job: WorkflowJob,
		node: WorkflowGraphNode,
	): Promise<{
		lane: WorkflowLane;
		turns: readonly TeamTurn[];
		other: readonly string[];
	}> {
		const lane = node.input.bindings?.lane;
		if (lane === undefined) throw new Error(`workflow node ${node.nodeId} is missing lane`);
		const turns: TeamTurn[] = [];
		const other: string[] = [];
		for (const dependency of node.dependencies) {
			const previous = job.graph.nodes[dependency];
			if (previous?.output === undefined) continue;
			const stored = this.results.get(previous.input.inputHash);
			if (stored?.output === undefined) continue;
			if (previous.kind === "TEAM_MEMBER") {
				turns.push({
					round: previous.input.bindings?.round ?? 0,
					accountId: previous.input.bindings?.accountId ?? DEFAULT_TEAM_ACCOUNTS[0],
					provider: getAccountDefinition(previous.input.bindings?.accountId ?? DEFAULT_TEAM_ACCOUNTS[0]).provider,
					text: stored.output,
				});
			} else other.push(stored.output);
		}
		return { lane, turns, other };
	}

	private mustNodeOutput(graph: WorkflowGraphSnapshot, nodeId: string): WorkflowGraphNode {
		const node = graph.nodes[nodeId];
		if (node?.state !== "COMPLETED" || node.output === undefined)
			throw new Error(`workflow node ${nodeId} has no completed output`);
		return node;
	}

	private researchPayload(job: WorkflowJob, researchA: WorkflowGraphNode, researchB: WorkflowGraphNode): string {
		const a = this.results.get(researchA.input.inputHash)?.output ?? "";
		const b = this.results.get(researchB.input.inputHash)?.output ?? "";
		return [
			`Repository: ${job.repository}`,
			`Base revision: ${job.baseRevision}`,
			`Objective: ${job.objective}`,
			"",
			"Research A",
			a,
			"",
			"Research B",
			b,
		].join("\n");
	}

	private handoffReceipt(handoff: WorkflowHandoff): WorkflowHandoffReceipt {
		return {
			handoffId: handoff.handoffId,
			source: handoff.sourceNodeIds.join("+"),
			recipient: handoff.recipient,
			sequence: handoff.sequence,
			payloadHash: handoff.payloadHash,
			status: handoff.status,
		};
	}

	private writerResult(output: string): WorkflowWriterResult {
		let parsed: unknown;
		try {
			parsed = JSON.parse(output);
		} catch {
			throw new Error("writer node result is not valid JSON");
		}
		if (typeof parsed !== "object" || parsed === null) throw new Error("writer node result is not an object");
		return parsed as WorkflowWriterResult;
	}

	private remediationControl(job: WorkflowJob, cycle: number, reviewA: string, reviewB: string) {
		const expectedHeadSha = job.pullRequest?.headSha;
		if (expectedHeadSha === undefined) throw new Error("review remediation requires an exact PR head");
		return createWorkflowControlMessage("START_REMEDIATION", {
			jobId: job.jobId,
			repository: job.repository,
			expectedHeadSha,
			cycle,
			reviewA,
			reviewB,
		});
	}

	private pendingActionForFailure(
		nodeId: string,
		failure: WorkflowFailure,
		expectedHeadSha?: string,
	): WorkflowPendingAction {
		if (failure.class === "AUTHENTICATION")
			return { kind: "ACCOUNT_REAUTH_REQUIRED", message: failure.message, nodeId };
		if (failure.class === "CONFIRMATION")
			return { kind: "UNKNOWN_CONFIRMATION", message: failure.message, nodeId, expectedHeadSha };
		if (failure.class === "AUTOMATION") return { kind: "CODE_FIX_REQUIRED", message: failure.message, nodeId };
		return { kind: "USER_ACTION_REQUIRED", message: failure.message, nodeId, expectedHeadSha };
	}

	private mapTeamProgress(event: TeamProgressEvent): {
		providerState?: string;
		meaningful: boolean;
		at: string;
	} {
		const at = new Date().toISOString();
		if (event.type === "step_progress") return { providerState: event.message, meaningful: true, at };
		if (event.type === "step_started") return { providerState: "started", meaningful: true, at };
		return { providerState: event.type, meaningful: false, at };
	}
}
