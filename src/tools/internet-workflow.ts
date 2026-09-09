import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS } from "#internet/core/accounts";
import { sleep } from "#internet/core/sleep";
import type { WorkflowDriver } from "#internet/workflow/driver";
import type { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowEngineError } from "#internet/workflow/engine";
import {
	type GitRunner,
	resolveWorkflowRepository,
	WorkflowRepositoryError,
} from "#internet/workflow/repository-context";
import { TERMINAL_WORKFLOW_STATES, type WorkflowJob } from "#internet/workflow/types";

export const WORKFLOW_OPERATIONS = [
	"start",
	"test",
	"status",
	"request_merge",
	"approve",
	"merge",
	"reject",
	"cancel",
	"continue",
] as const;
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];

const DEFAULT_TEST_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_TEST_POLL_MS = 1_000;

export interface WorkflowTestDependencies {
	readonly browser?: Pick<BrowserManager, "status">;
	readonly runGit?: GitRunner;
	readonly timeoutMs?: number;
	readonly pollMs?: number;
}

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
		...(job.ciReceipt === undefined
			? {}
			: { ciStatus: job.ciReceipt.status, ciHeadSha: job.ciReceipt.headSha, ciCheckedAt: job.ciReceipt.checkedAt }),
		...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),
		...(job.mergeReceipt === undefined
			? {}
			: { mergedSha: job.mergeReceipt.mergedSha, mergeExecutor: job.mergeReceipt.executorAccountId }),
		updatedAt: job.updatedAt,
	};
}

function workflowTestObjective(marker: string): string {
	return [
		"Run the repository workflow acceptance test with the smallest possible real change.",
		"Create or update docs/.workflow-smoke so its entire UTF-8 contents are exactly:",
		`workflow-acceptance=${marker}`,
		"Change only docs/.workflow-smoke.",
		"Do not modify runtime code, dependencies, configuration, tests, or any other documentation.",
		"Open exactly one pull request for this change and do not merge it until the workflow sends MERGE_AUTHORIZED.",
	].join("\n");
}

function testFailure(job: WorkflowJob, message: string) {
	return { ok: false, operation: "test", result: "FAIL" as const, ...project(job), message };
}

async function runAcceptanceTest(
	engine: WorkflowEngine,
	driver: Pick<WorkflowDriver, "enqueue" | "cancel">,
	dependencies: WorkflowTestDependencies,
	exec: { agent?: unknown; signal: AbortSignal },
) {
	if (dependencies.browser === undefined) {
		return {
			ok: false,
			operation: "test",
			result: "FAIL" as const,
			message: "workflow test requires browser account status access",
		};
	}
	const agent = exec.agent as { id?: unknown; session?: { header?: { cwd?: unknown } } } | undefined;
	const cwd = agent?.session?.header?.cwd;
	if (typeof cwd !== "string" || cwd.trim() === "") {
		return {
			ok: false,
			operation: "test",
			result: "FAIL" as const,
			message: "workflow test requires a session working directory",
		};
	}
	const ownerSessionId = String(agent?.id ?? "");
	if (ownerSessionId === "")
		return { ok: false, operation: "test", result: "FAIL" as const, message: "workflow test requires an owner session" };

	const statuses = await Promise.all(ACCOUNT_IDS.map((accountId) => dependencies.browser!.status(accountId)));
	const accountPreflight = statuses.map((status) => `${status.accountId}=${status.state}`).join(", ");
	const unavailable = statuses.filter((status) => status.state !== "ready");
	if (unavailable.length > 0) {
		return {
			ok: false,
			operation: "test",
			result: "FAIL" as const,
			accountPreflight,
			message: `workflow test not started; required accounts are not ready: ${unavailable.map((status) => `${status.accountId}=${status.state}`).join(", ")}`,
		};
	}

	const repository = await resolveWorkflowRepository(cwd, exec.signal, dependencies.runGit, "internet_workflow test");
	const marker = `${new Date().toISOString()}-${Math.random().toString(16).slice(2, 10)}`;
	const job = engine.start({
		objective: workflowTestObjective(marker),
		repository: repository.url,
		baseRevision: repository.revision,
		ownerSessionId,
	});
	driver.enqueue(job.jobId);

	const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
	const pollMs = dependencies.pollMs ?? DEFAULT_TEST_POLL_MS;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (exec.signal.aborted) throw exec.signal.reason ?? new Error("workflow test aborted");
		let current = engine.status(job.jobId);
		if (current.state === "DONE") {
			return {
				ok: true,
				operation: "test",
				result: "PASS" as const,
				accountPreflight,
				...project(current),
				message: "full workflow acceptance test completed through real merge and DONE",
			};
		}
		if (current.state === "AWAITING_MERGE_AUTHORIZATION") {
			const expectedHeadSha = current.pendingAction?.expectedHeadSha;
			if (
				current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED" ||
				current.pullRequest === undefined ||
				expectedHeadSha === undefined ||
				expectedHeadSha !== current.pullRequest.headSha ||
				current.ciReceipt === undefined ||
				current.ciReceipt.headSha !== expectedHeadSha ||
				!["PASS", "NONE"].includes(current.ciReceipt.status) ||
				!current.teamRuns.review.every(
					(run) => run.result?.reviewVerdict === "PASS" && run.result.reviewedHeadSha === expectedHeadSha,
				)
			) {
				return testFailure(
					current,
					"acceptance controller refused merge authorization because exact-head evidence was incomplete",
				);
			}
			current = engine.approve({ jobId: current.jobId, expectedHeadSha });
			driver.enqueue(current.jobId);
		} else if (current.state === "FAILED_RETRYABLE") {
			if (current.pendingAction?.kind !== "RETRY_REQUIRED" || current.pendingAction.resumeState === undefined) {
				return testFailure(current, "workflow entered FAILED_RETRYABLE without an explicit retry path");
			}
			current = engine.continue(current.jobId);
			driver.enqueue(current.jobId);
		} else if (
			current.state === "BLOCKED" ||
			current.state === "UNKNOWN_CONFIRMATION" ||
			current.state === "FAILED_TERMINAL" ||
			current.state === "CANCELLED"
		) {
			return testFailure(
				current,
				current.pendingAction?.message ?? `workflow acceptance test stopped in ${current.state}`,
			);
		} else if (TERMINAL_WORKFLOW_STATES.has(current.state)) {
			return testFailure(current, `workflow acceptance test ended in ${current.state}`);
		}
		await sleep(pollMs, exec.signal);
	}
	const current = engine.status(job.jobId);
	return {
		ok: false,
		operation: "test",
		result: "TIMEOUT" as const,
		accountPreflight,
		...project(current),
		message: `workflow acceptance test timed out after ${timeoutMs} ms; durable job and PR were left intact for inspection`,
	};
}

/** Define the deterministic workflow control-plane tool. */
export function defineInternetWorkflowTool(
	engine: WorkflowEngine,
	driver: Pick<WorkflowDriver, "enqueue" | "cancel">,
	testDependencies: WorkflowTestDependencies = {},
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_workflow",
		description:
			"Create and control automatically driven durable coding workflow jobs. test performs a full real acceptance workflow against the current Git repository after account preflight, auto-authorizing only the exact reviewed healthy head.",
		parameters: {
			operation: {
				type: "string",
				required: true,
				enum: [...WORKFLOW_OPERATIONS],
				description: "Workflow operation.",
			},
			jobId: { type: "string", description: "32-character workflow job ID for non-start/test operations." },
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
					result: { type: "string", enum: ["PASS", "FAIL", "TIMEOUT"] },
					accountPreflight: { type: "string" },
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
					pendingAction: { type: "string" },
					pendingMessage: { type: "string" },
					ciStatus: { type: "string" },
					ciHeadSha: { type: "string" },
					ciCheckedAt: { type: "string" },
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
					result?: unknown;
					jobId?: unknown;
					state?: unknown;
					message?: unknown;
				};
				const summary = [`ok=${String(result.ok)}`, `operation=${String(result.operation)}`];
				if (result.result !== undefined) summary.push(`result=${String(result.result)}`);
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
				if (operation === "test") return await runAcceptanceTest(engine, driver, testDependencies, exec as never);
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
					job = await engine.runPrHealthCheck(args.jobId, exec.signal);
					if (job.state === "READY_FOR_MERGE_AUTHORIZATION") job = engine.requestMergeAuthorization(args.jobId);
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
				if (error instanceof WorkflowEngineError || error instanceof WorkflowRepositoryError) {
					return { ok: false, operation, message: error.message };
				}
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
