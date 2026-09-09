import { defineTool } from "@deepseek-ai/dsh-tools";
import type { WorkflowDriver } from "#internet/workflow/driver";
import type { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowEngineError } from "#internet/workflow/engine";
import type { WorkflowJob } from "#internet/workflow/types";

export const WORKFLOW_OPERATIONS = [
	"start",
	"status",
	"request_merge",
	"approve",
	"merge",
	"reject",
	"cancel",
	"continue",
] as const;
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];

function runsSummary(runs: WorkflowJob["teamRuns"]["research"]): string {
	return runs
		.map(
			(run) =>
				`${run.lane}:${run.status}:attempts=${run.attempts}${run.error === undefined ? "" : `:error=${run.error}`}`,
		)
		.join(", ");
}

function handoffSummary(job: WorkflowJob): string {
	return job.handoffReceipts
		.map((item) => `${item.sequence}:${item.source}->${item.recipient}:${item.status}:${item.payloadHash}`)
		.join(", ");
}

function lastError(job: WorkflowJob): string | undefined {
	const failed = [...job.teamRuns.research, ...job.teamRuns.review].find(
		(run) => run.status === "failed" && run.error !== undefined,
	);
	return failed?.error ?? job.pendingAction?.message;
}

function project(job: WorkflowJob) {
	return {
		jobId: job.jobId,
		state: job.state,
		repository: job.repository,
		baseRevision: job.baseRevision,
		researchRuns: runsSummary(job.teamRuns.research),
		reviewRuns: runsSummary(job.teamRuns.review),
		handoffs: handoffSummary(job),
		writerState: `account=${job.writerConversation.accountId} session=${job.writerConversation.sessionId}`,
		reviewCycle: job.reviewCycle,
		...(job.lastEvent === undefined
			? {}
			: {
					lastEventClass: job.lastEvent.class,
					lastEventType: job.lastEvent.type,
					lastEventMessage: job.lastEvent.message,
				}),
		...(lastError(job) === undefined ? {} : { lastError: lastError(job) }),
		...(job.pullRequest === undefined
			? {}
			: {
					prNumber: job.pullRequest.number,
					prUrl: job.pullRequest.url,
					prHeadSha: job.pullRequest.headSha,
				}),
		...(job.pendingAction === undefined
			? {}
			: {
					pendingAction: job.pendingAction.kind,
					pendingMessage: job.pendingAction.message,
				}),
		...(job.prHealth === undefined
			? {}
			: {
					prHealthStatus: job.prHealth.status,
					prHealthHeadSha: job.prHealth.headSha,
					prHealthCheckedAt: job.prHealth.checkedAt,
				}),
		...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),
		...(job.mergeReceipt === undefined
			? {}
			: { mergedSha: job.mergeReceipt.mergedSha, mergeExecutor: job.mergeReceipt.executorAccountId }),
		updatedAt: job.updatedAt,
	};
}

/** Define the deterministic workflow control-plane tool. */
export function defineInternetWorkflowTool(
	engine: WorkflowEngine,
	driver: Pick<WorkflowDriver, "enqueue" | "cancel">,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_workflow",
		description:
			"Create and control automatically driven durable coding workflow jobs. start persists authoritative state and enqueues execution; status/approve/reject/cancel/continue operate by job ID.",
		parameters: {
			operation: {
				type: "string",
				required: true,
				enum: [...WORKFLOW_OPERATIONS],
				description: "Workflow operation.",
			},
			jobId: { type: "string", description: "32-character workflow job ID for non-start operations." },
			objective: { type: "string", description: "Coding objective for start." },
			repository: { type: "string", description: "Authoritative public repository URL for start." },
			baseRevision: { type: "string", description: "Full 40-character Git SHA for start." },
			expectedHeadSha: { type: "string", description: "Exact PR head SHA when authorizing a head-bound action." },
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean", required: true },
					operation: { type: "string", required: true },
					jobId: { type: "string" },
					state: { type: "string" },
					repository: { type: "string" },
					baseRevision: { type: "string" },
					researchRuns: { type: "string" },
					reviewRuns: { type: "string" },
					handoffs: { type: "string" },
					writerState: { type: "string" },
					reviewCycle: { type: "number" },
					lastEventClass: { type: "string" },
					lastEventType: { type: "string" },
					lastEventMessage: { type: "string" },
					lastError: { type: "string" },
					prNumber: { type: "number" },
					prUrl: { type: "string" },
					prHeadSha: { type: "string" },
					prHealthStatus: { type: "string" },
					prHealthHeadSha: { type: "string" },
					prHealthCheckedAt: { type: "string" },
					pendingAction: { type: "string" },
					pendingMessage: { type: "string" },
					authorizedHeadSha: { type: "string" },
					mergedSha: { type: "string" },
					mergeExecutor: { type: "string" },
					updatedAt: { type: "string" },
					message: { type: "string" },
				},
			},
			render: (_args, value) => {
				const result = value as {
					ok?: unknown;
					operation?: unknown;
					jobId?: unknown;
					state?: unknown;
					message?: unknown;
				};
				const summary = [`ok=${String(result.ok)}`, `operation=${String(result.operation)}`];
				if (result.jobId !== undefined) summary.push(`job=${String(result.jobId)}`);
				if (result.state !== undefined) summary.push(`state=${String(result.state)}`);
				if (result.message !== undefined) summary.push(String(result.message));
				return [{ type: "text", text: summary.join(" · ") }];
			},
			presentationMeta: (_args, value) => value,
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const operation = args.operation as WorkflowOperation;
			try {
				if (operation === "start") {
					if (
						typeof args.objective !== "string" ||
						typeof args.repository !== "string" ||
						typeof args.baseRevision !== "string"
					) {
						return { ok: false, operation, message: "start requires objective, repository, and baseRevision" };
					}
					const job = engine.start({
						objective: args.objective,
						repository: args.repository,
						baseRevision: args.baseRevision,
						ownerSessionId: String(exec.agent?.id ?? ""),
					});
					driver.enqueue(job.jobId);
					return { ok: true, operation, ...project(job) };
				}
				if (typeof args.jobId !== "string") return { ok: false, operation, message: `${operation} requires jobId` };
				const expectedHeadSha = typeof args.expectedHeadSha === "string" ? args.expectedHeadSha : undefined;
				let job: WorkflowJob;
				if (operation === "status") job = engine.status(args.jobId);
				else if (operation === "request_merge") {
					const current = engine.status(args.jobId);
					const checked =
						current.pullRequest !== undefined &&
						current.prHealth?.headSha === current.pullRequest.headSha &&
						(current.prHealth.status === "PASS" || current.prHealth.status === "NONE")
							? current
							: await engine.runPrHealthGate(args.jobId, exec.signal);
					job =
						checked.state === "READY_FOR_MERGE_AUTHORIZATION"
							? engine.requestMergeAuthorization(args.jobId)
							: checked;
				} else if (operation === "merge") job = await engine.runWriterMerge(args.jobId, exec.signal);
				else if (operation === "cancel") job = await driver.cancel(args.jobId);
				else if (operation === "continue") {
					job = engine.continue(args.jobId);
					driver.enqueue(job.jobId);
				} else if (operation === "approve") {
					job = engine.approve({ jobId: args.jobId, expectedHeadSha });
					driver.enqueue(job.jobId);
				} else job = engine.reject({ jobId: args.jobId, expectedHeadSha });
				return { ok: true, operation, ...project(job) };
			} catch (error) {
				if (error instanceof WorkflowEngineError) return { ok: false, operation, message: error.message };
				return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `internet_workflow ${String(args.operation)}`,
			kind: "other",
		}),
	});
}
