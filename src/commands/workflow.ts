import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { WorkflowAdmissionDraftInput } from "#internet/workflow/admission/types";
import {
	type WorkflowAuthorizationContext,
	workflowSessionAuthorizationContext,
} from "#internet/workflow/authorization";
import { WorkflowOperatorError } from "#internet/workflow/operator";
import { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
import {
	type GitRunner,
	resolveWorkflowRepository,
	runGitCommand,
	WorkflowRepositoryError,
} from "#internet/workflow/repository-context";
import { WorkflowServiceError } from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";

const USAGE = "Usage: /workflow <objective> | list | status [jobId] | stop [jobId] | continue [jobId] | delete <jobId>";
const OPERATIONS = new Set(["list", "status", "stop", "continue", "delete"]);

export type { GitRunner } from "#internet/workflow/repository-context";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";

export interface WorkflowCommandService {
	autoSubmit(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob;
}

export interface WorkflowCommandOperator {
	list(ownerSessionId: string): string;
	status(ownerSessionId: string, jobId?: string): string;
	stop(ownerSessionId: string, jobId?: string): Promise<string>;
	continue(ownerSessionId: string, jobId?: string): string;
	delete(ownerSessionId: string, jobId?: string): Promise<string>;
}

export interface WorkflowCommandDependencies {
	readonly service: WorkflowCommandService;
	readonly operator: WorkflowCommandOperator;
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
	if (operation === "delete") {
		if (parts.length !== 2 || parts[1] === undefined)
			throw new WorkflowOperatorError("/workflow delete requires exactly one jobId");
		return { operation, jobId: parts[1] };
	}
	if (parts.length > 2) throw new WorkflowOperatorError(`/workflow ${operation} accepts at most one jobId`);
	return { operation, ...(parts[1] === undefined ? {} : { jobId: parts[1] }) };
}

export function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition {
	const runGit = dependencies.runGit ?? runGitCommand;
	return {
		name: "workflow",
		description: "start, inspect, stop, or resume a durable reviewed implementation workflow",
		input: { hint: "<objective> | list | status [jobId] | stop [jobId] | continue [jobId] | delete <jobId>" },
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
					if (parsed.operation === "stop")
						return { kind: "success", text: await dependencies.operator.stop(ownerSessionId, parsed.jobId) };
					if (parsed.operation === "delete")
						return { kind: "success", text: await dependencies.operator.delete(ownerSessionId, parsed.jobId) };
					return { kind: "success", text: dependencies.operator.continue(ownerSessionId, parsed.jobId) };
				}

				const cwd = invocation.agent.session.header.cwd;
				if (cwd === undefined) return { kind: "error", text: "/workflow requires a session working directory." };
				const repository = await resolveWorkflowRepository(cwd, invocation.signal, runGit, "/workflow");
				const job = dependencies.service.autoSubmit(
					workflowSessionAuthorizationContext(ownerSessionId),
					createSoftwareAdmissionDraft({
						rawSource: rawInput,
						sourceProvenance: "user_explicit",
						repository: repository.url,
						baseRevision: repository.revision,
						targetProvenance: "system_observed",
						authorityProvenance: "user_explicit",
					}),
				);
				return {
					kind: "success",
					text: `Workflow ${job.jobId} started for ${repository.url} at ${repository.revision.slice(0, 12)}.`,
				};
			} catch (error) {
				if (invocation.signal.aborted) throw error;
				if (
					error instanceof WorkflowRepositoryError ||
					error instanceof WorkflowOperatorError ||
					error instanceof WorkflowServiceError
				) {
					return { kind: "error", text: error.message };
				}
				if (error instanceof Error) return { kind: "error", text: error.message };
				throw error;
			}
		},
	};
}
