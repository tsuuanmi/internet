import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
import { runTeam } from "#internet/team/orchestrator";

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
	  }
	| {
			readonly ok: false;
			readonly error: string;
			readonly failedAccountId: AccountId;
			readonly failedProvider: WebProvider;
	  };

export interface WorkflowTeamRunner {
	run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult>;
}

type TeamManager = Pick<BrowserManager, "chat">;

/**
 * Workflow-owned direct team runner. It calls the same lower-level team
 * primitive as `internet_team` without creating a free-form intermediary agent.
 */
export class BrowserWorkflowTeamRunner implements WorkflowTeamRunner {
	private readonly manager: TeamManager;
	private readonly config: BrowserConfig;

	constructor(manager: TeamManager, config: BrowserConfig) {
		this.manager = manager;
		this.config = config;
	}

	async run(request: WorkflowTeamRunRequest): Promise<WorkflowTeamRunResult> {
		const result = await runTeam((accountId, chatRequest) => this.manager.chat(accountId, chatRequest), {
			task: request.task,
			sessionId: request.sessionId,
			rounds: this.config.teamRounds,
			synthesize: true,
			synthesizer: request.synthesizer,
			accounts: request.accounts,
			visible: false,
			signal: request.signal,
		});
		if ("error" in result) {
			return {
				ok: false,
				error: result.error.message,
				failedAccountId: result.error.accountId,
				failedProvider: result.error.provider,
			};
		}
		return {
			ok: true,
			finalAnswer: result.finalAnswer,
			finalAccountId: result.finalAccountId,
			finalProvider: result.finalProvider,
		};
	}
}
