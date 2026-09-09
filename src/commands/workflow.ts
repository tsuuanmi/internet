import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import {
	type GitRunner,
	resolveWorkflowRepository,
	runGitCommand,
	WorkflowRepositoryError,
} from "#internet/workflow/repository-context";
import { WorkflowOperator, WorkflowOperatorError } from "#internet/workflow/operator";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";

const USAGE = "Usage: /workflow <objective> | list | status [jobId] | watch [jobId] | stop [jobId] | continue [jobId]";
const OPERATIONS = new Set(["list", "status", "watch", "stop", "continue"]);

export type { GitRunner } from "#internet/workflow/repository-context";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";

export interface WorkflowStarter {
	start(input: StartWorkflowInput): WorkflowJob;
}

export interface WorkflowEnqueuer {
	enqueue(jobId: string): void;
}

export interface WorkflowCommandDependencies {
	readonly engine: WorkflowStarter;
	readonly driver: WorkflowEnqueuer;
	readonly operator: WorkflowOperator;
	readonly runGit?: GitRunner;
}

function operationInput(rawInput: string): { operation: string; jobId?: string } | undefined {
	const parts = rawInput.trim().split(/\s+/u);
	const operation = parts[0];
	if (operation === undefined || !OPERATIONS.has(operation)) return undefined;
	if (operation === "list") {
		if (parts.length !== 1) throw new WorkflowOperatorError("/workflow list does not accept a jobId");
		return { operation };
	}
	if (parts.length > 2) throw new WorkflowOperatorError(`/workflow ${operation} accepts at most one jobId`);
	return { operation, ...(parts[1] === undefined ? {} : { jobId: parts[1] }) };
}

/** Define the normal user-facing durable workflow command family. */
export function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition {
	const runGit = dependencies.runGit ?? runGitCommand;
	return {
		name: "workflow",
		description: "start, inspect, follow, stop, or resume a durable reviewed implementation workflow",
		input: { hint: "<objective> | list | status [jobId] | watch [jobId] | stop [jobId] | continue [jobId]" },
		async handler(invocation) {
			const rawInput = invocation.rawInput.trim();
			if (rawInput === "") return { kind: "error", text: `A workflow objective or operation is required. ${USAGE}` };
			const ownerSessionId = String(invocation.agent.id);
			try {
				const parsed = operationInput(rawInput);
				if (parsed !== undefined) {
					if (parsed.operation === "list")
						return { kind: "success", text: dependencies.operator.list(ownerSessionId) };
					if (parsed.operation === "status")
						return { kind: "success", text: dependencies.operator.status(ownerSessionId, parsed.jobId) };
					if (parsed.operation === "watch")
						return { kind: "success", text: dependencies.operator.watch(ownerSessionId, parsed.jobId) };
					if (parsed.operation === "stop")
						return { kind: "success", text: await dependencies.operator.stop(ownerSessionId, parsed.jobId) };
					return { kind: "success", text: dependencies.operator.continue(ownerSessionId, parsed.jobId) };
				}

				const cwd = invocation.agent.session.header.cwd;
				if (cwd === undefined) return { kind: "error", text: "/workflow requires a session working directory." };
				const repository = await resolveWorkflowRepository(cwd, invocation.signal, runGit, "/workflow");
				const job = dependencies.engine.start({
					objective: rawInput,
					repository: repository.url,
					baseRevision: repository.revision,
					ownerSessionId,
				});
				dependencies.driver.enqueue(job.jobId);
				return {
					kind: "success",
					text: `Workflow ${job.jobId} started for ${repository.url} at ${repository.revision.slice(0, 12)}.`,
				};
			} catch (error) {
				if (invocation.signal.aborted) throw error;
				if (error instanceof WorkflowRepositoryError || error instanceof WorkflowOperatorError) {
					return { kind: "error", text: error.message };
				}
				if (error instanceof Error) return { kind: "error", text: error.message };
				throw error;
			}
		},
	};
}
