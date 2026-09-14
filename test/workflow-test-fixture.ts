import { WorkflowEngine, type WorkflowEngineOptions } from "#internet/workflow/engine";
import { WorkflowEventJournal } from "#internet/workflow/events";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowNodeResultStore } from "#internet/workflow/node-result-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

export interface WorkflowTestRuntime {
	readonly engine: WorkflowEngine;
	readonly jobs: WorkflowJobStore;
	readonly events: WorkflowEventJournal;
}

export interface WorkflowTestRuntimeOptions {
	readonly teams?: WorkflowTeamRunner;
	readonly writer?: WorkflowWriterRunner;
	readonly engine?: WorkflowEngineOptions;
}

function defaultTeams(): WorkflowTeamRunner {
	return {
		rounds: 1,
		async runStep(request) {
			const provider = request.step.accountId === "gemini-thinker" ? "gemini-web" : "chatgpt-web";
			if (request.step.kind === "synthesis") {
				return { ok: true, step: request.step, finalAnswer: "synthesized" };
			}
			return {
				ok: true,
				step: request.step,
				turn: {
					round: request.step.round,
					accountId: request.step.accountId,
					provider,
					text: `${request.step.stepId}:ok`,
				},
			};
		},
	};
}

function defaultWriter(): WorkflowWriterRunner {
	return {
		async deliverExact() {},
		async runControl() {
			return { status: "BLOCKED", message: "writer result was not configured for this test" };
		},
	};
}

export function createWorkflowTestRuntime(root: string, options: WorkflowTestRuntimeOptions = {}): WorkflowTestRuntime {
	const jobs = new WorkflowJobStore(root);
	const events = new WorkflowEventJournal(root);
	const engine = new WorkflowEngine(
		jobs,
		options.teams ?? defaultTeams(),
		new WorkflowTeamPromptBuilder(),
		new WorkflowHandoffStore(root),
		options.writer ?? defaultWriter(),
		new WorkflowNodeResultStore(root),
		undefined,
		events,
		options.engine,
	);
	return { engine, jobs, events };
}
