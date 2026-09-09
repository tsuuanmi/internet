import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { runTeam } from "#internet/team/orchestrator";
import type { TeamFailureDetail, TeamProgressEvent, TeamTurn } from "#internet/team/types";
import type { WorkflowTeamObserver } from "#internet/workflow/team-observer";

export interface WorkflowTeamRunRequest {
	readonly task: string;
	readonly sessionId: string;
	readonly accounts: readonly AccountId[];
	readonly synthesizer: AccountId;
	readonly signal?: AbortSignal;
}

export type WorkflowTeamRunResult =
	| {
			readonly ok: true;
			readonly finalAnswer: string;
			readonly finalAccountId: AccountId;
			readonly finalProvider: WebProvider;
			readonly transcript: readonly TeamTurn[];
	  }
	| {
			readonly ok: false;
			readonly error: string;
			readonly failedAccountId: AccountId;
			readonly failedProvider: WebProvider;
			readonly failure: TeamFailureDetail;
			readonly transcript: readonly TeamTurn[];
	  };

export interface WorkflowTeamRunner {
	run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}

type TeamManager = Pick<BrowserManager, "chat">;

/**
 * Workflow-owned adapter over the single shared team engine. The workflow owns
 * durable session identity and observation; the team core owns rounds/synthesis.
 */
export class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
	private readonly manager: TeamManager;
	private readonly config: BrowserConfig;
	private readonly observer: WorkflowTeamObserver;

	constructor(manager: TeamManager, config: BrowserConfig, observer: WorkflowTeamObserver) {
		this.manager = manager;
		this.config = config;
		this.observer = observer;
	}

	async run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult> {
		const observation = this.observer.begin(request.sessionId);
		const strategy = observation.context.phase === "research" ? "workflow-research" : "workflow-review";
		let failedProgress: TeamProgressEvent | undefined;
		const result = await runTeam((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
			task: request.task,
			sessionId: request.sessionId,
			rounds: this.config.teamRounds,
			synthesize: true,
			synthesizer: request.synthesizer,
			accounts: request.accounts,
			promptStrategy: strategy,
			visible: false,
			signal: request.signal,
			onProgress: (event) => {
				this.observer.record(observation, event);
				if (event.status === "failed") failedProgress = event;
			},
		});
		if ("error" in result) {
			const failureEvent =
				failedProgress ??
				({
					at: result.error.failedAt,
					stage: result.error.stage,
					status: "failed",
					...(result.error.round === undefined ? {} : { round: result.error.round }),
					accountId: result.error.accountId,
					provider: result.error.provider,
					kind: result.error.kind,
					message: result.error.message,
					retryable: result.error.retryable,
				} satisfies TeamProgressEvent);
			this.observer.fail(observation, failureEvent);
			return {
				ok: false,
				error: result.error.message,
				failedAccountId: result.error.accountId,
				failedProvider: result.error.provider,
				failure: result.error,
				transcript: result.transcript,
			};
		}
		this.observer.complete(observation, new Date().toISOString());
		return {
			ok: true,
			finalAnswer: result.finalAnswer,
			finalAccountId: result.finalAccountId,
			finalProvider: result.finalProvider,
			transcript: result.transcript,
		};
	}
}
