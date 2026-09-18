import {
	DEFAULT_TEAM_ACCOUNTS,
	type AccountId,
	accountHasCapability,
} from "#internet/core/accounts";

export interface WorkflowProfileAvailability {
	readonly software: boolean;
	readonly research: boolean;
}

export function resolveWorkflowProfileAvailability(accounts: ReadonlySet<AccountId>): WorkflowProfileAvailability {
	const teamReady = DEFAULT_TEAM_ACCOUNTS.every((accountId) => accounts.has(accountId));
	const researchAccountReady =
		accounts.has("chatgpt-thinker") && accountHasCapability("chatgpt-thinker", "research.deep");
	return {
		software: teamReady && accounts.has("chatgpt-writer"),
		research: teamReady && researchAccountReady,
	};
}
