import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS } from "#internet/core/accounts";
import { sleep } from "#internet/core/sleep";
import type { GitRunner } from "#internet/workflow/repository-context";
import { resolveWorkflowRepository, WorkflowRepositoryError } from "#internet/workflow/repository-context";
import {
	WorkflowServiceError,
	workflowSessionAuthorizationContext,
	type WorkflowAuthorizationContext,
} from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";

export const WORKFLOW_OPERATIONS = ["start", "test", "status", "cancel", "continue"] as const;
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];

const DEFAULT_TEST_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_TEST_POLL_MS = 1_000;

export interface WorkflowTestDependencies {
	readonly browser?: Pick<BrowserManager, "status">;
	readonly runGit?: GitRunner;
	readonly timeoutMs?: number;
	readonly pollMs?: number;
}

export interface InternetWorkflowService {
	start(
		context: WorkflowAuthorizationContext,
		input: { readonly objective: string; readonly repository: string; readonly baseRevision: string },
	): WorkflowJob;
	status(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
	cancel(context: WorkflowAuthorizationContext, jobId?: string): Promise<WorkflowJob>;
	continue(context: WorkflowAuthorizationContext, jobId?: string): WorkflowJob;
}

function graphSummary(job: WorkflowJob): string {
	const counts = new Map<string, number>();
	for (const node of Object.values(job.graph.nodes)) counts.set(node.state, (counts.get(node.state) ?? 0) + 1);
	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([state, count]) => `${state}:${count}`)
		.join(", ");
}

function handoffSummary(job: WorkflowJob): string {
	return job.handoffReceipts
		.map((item) => `${item.source}->${item.recipient}:${item.status}:${item.payloadHash}`)
		.join(", ");
}

function project(job: WorkflowJob) {
	return {
		jobId: job.jobId,
		phase: job.graph.phase,
		lifecycle: job.graph.lifecycle,
		repository: job.repository,
		baseRevision: job.baseRevision,
		graph: graphSummary(job),
		handoffs: handoffSummary(job),
		reviewCycle: job.reviewCycle,
		...(job.lastEvent === undefined
			? {}
			: {
					lastEventClass: job.lastEvent.class,
					lastEventType: job.lastEvent.type,
					lastEventMessage: job.lastEvent.message,
				}),
		...(job.pullRequest === undefined
			? {}
			: {
					prNumber: job.pullRequest.number,
					prUrl: job.pullRequest.url,
					prHeadSha: job.pullRequest.headSha,
				}),
		...(job.writerConversation.url === undefined ? {} : { writerChatUrl: job.writerConversation.url }),
		...(job.pendingAction === undefined
			? {}
			: {
					pendingAction: job.pendingAction.kind,
					pendingMessage: job.pendingAction.message,
				}),
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
		"Open exactly one pull request for this change and never merge it as part of the workflow.",
	].join("\n");
}

function testFailure(job: WorkflowJob, message: string) {
	return { ok: false, operation: "test", result: "FAIL" as const, ...project(job), message };
}

function completedHandoffIsExact(job: WorkflowJob): boolean {
	return (
		job.graph.lifecycle === "COMPLETED" &&
		job.graph.phase === "DONE" &&
		job.pullRequest !== undefined &&
		job.writerConversation.url !== undefined &&
		job.reviewCycle > 0
	);
}

async function runAcceptanceTest(
	service: InternetWorkflowService,
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
	const ownerSessionId = String(agent?.id ?? "");
	if (typeof cwd !== "string" || cwd.trim() === "" || ownerSessionId === "") {
		return {
			ok: false,
			operation: "test",
			result: "FAIL" as const,
			message: "workflow test requires a session working directory and owner session",
		};
	}
	const authorization = workflowSessionAuthorizationContext(ownerSessionId);

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
	const job = service.start(authorization, {
		objective: workflowTestObjective(marker),
		repository: repository.url,
		baseRevision: repository.revision,
	});

	const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
	const pollMs = dependencies.pollMs ?? DEFAULT_TEST_POLL_MS;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (exec.signal.aborted) throw exec.signal.reason ?? new Error("workflow test aborted");
		const current = service.status(authorization, job.jobId);
		if (current.graph.lifecycle === "COMPLETED") {
			if (!completedHandoffIsExact(current)) {
				return testFailure(current, "workflow completed without an exact reviewed PR and Writer chat handoff");
			}
			return {
				ok: true,
				operation: "test",
				result: "PASS" as const,
				accountPreflight,
				...project(current),
				message: "full workflow acceptance test completed through exact-head review and Writer handoff",
			};
		}
		if (current.graph.lifecycle === "BLOCKED") {
			return testFailure(current, current.pendingAction?.message ?? "workflow acceptance test blocked");
		}
		if (current.graph.lifecycle === "CANCELLED") {
			return testFailure(current, "workflow acceptance test was cancelled");
		}
		await sleep(pollMs, exec.signal);
	}
	const current = service.status(authorization, job.jobId);
	return {
		ok: false,
		operation: "test",
		result: "TIMEOUT" as const,
		accountPreflight,
		...project(current),
		message: `workflow acceptance test timed out after ${timeoutMs} ms; durable job and PR were left intact for inspection`,
	};
}

export function defineInternetWorkflowTool(
	service: InternetWorkflowService,
	testDependencies: WorkflowTestDependencies = {},
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_workflow",
		description:
			"Create and control graph-driven durable coding workflows. test performs a full real workflow through exact-head review and Writer chat handoff without merging.",
		parameters: {
			operation: {
				type: "string",
				required: true,
				enum: [...WORKFLOW_OPERATIONS],
				description: "Workflow operation.",
			},
			jobId: { type: "string", description: "32-character workflow job ID for non-start/test operations." },
			objective: { type: "string", description: "Coding objective for start." },
			repository: { type: "string", description: "Authoritative repository URL for start." },
			baseRevision: { type: "string", description: "Full 40-character Git SHA for start." },
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
					phase: { type: "string" },
					lifecycle: { type: "string" },
					repository: { type: "string" },
					baseRevision: { type: "string" },
					graph: { type: "string" },
					handoffs: { type: "string" },
					reviewCycle: { type: "number" },
					lastEventClass: { type: "string" },
					lastEventType: { type: "string" },
					lastEventMessage: { type: "string" },
					prNumber: { type: "number" },
					prUrl: { type: "string" },
					prHeadSha: { type: "string" },
					writerChatUrl: { type: "string" },
					pendingAction: { type: "string" },
					pendingMessage: { type: "string" },
					updatedAt: { type: "string" },
					message: { type: "string" },
				},
			},
			render: (_args, value) => {
				const result = value as Record<string, unknown>;
				const summary = [`ok=${String(result.ok)}`, `operation=${String(result.operation)}`];
				if (result.result !== undefined) summary.push(`result=${String(result.result)}`);
				if (result.jobId !== undefined) summary.push(`job=${String(result.jobId)}`);
				if (result.phase !== undefined) summary.push(`phase=${String(result.phase)}`);
				if (result.lifecycle !== undefined) summary.push(`status=${String(result.lifecycle)}`);
				if (result.message !== undefined) summary.push(String(result.message));
				return [{ type: "text", text: summary.join(" · ") }];
			},
			presentationMeta: (_args, value) => value,
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const operation = args.operation as WorkflowOperation;
			try {
				if (operation === "test") return await runAcceptanceTest(service, testDependencies, exec as never);
				const ownerSessionId = String(exec.agent?.id ?? "");
				const authorization = workflowSessionAuthorizationContext(ownerSessionId);
				if (operation === "start") {
					if (
						typeof args.objective !== "string" ||
						typeof args.repository !== "string" ||
						typeof args.baseRevision !== "string"
					) {
						return { ok: false, operation, message: "start requires objective, repository, and baseRevision" };
					}
					const job = service.start(authorization, {
						objective: args.objective,
						repository: args.repository,
						baseRevision: args.baseRevision,
					});
					return { ok: true, operation, ...project(job) };
				}
				if (typeof args.jobId !== "string") return { ok: false, operation, message: `${operation} requires jobId` };
				let job: WorkflowJob;
				if (operation === "status") job = service.status(authorization, args.jobId);
				else if (operation === "cancel") job = await service.cancel(authorization, args.jobId);
				else job = service.continue(authorization, args.jobId);
				return { ok: true, operation, ...project(job) };
			} catch (error) {
				if (error instanceof WorkflowRepositoryError || error instanceof WorkflowServiceError) {
					return { ok: false, operation, message: error.message };
				}
				return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
			}
		},
		presentCall: (args) => ({ card: "generic", title: `internet_workflow ${String(args.operation)}`, kind: "other" }),
	});
}
