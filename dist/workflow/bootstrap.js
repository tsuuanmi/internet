import { accountHasCapability, DEFAULT_TEAM_ACCOUNTS } from "#internet/core/accounts";
export function resolveWorkflowProfileAvailability(accounts) {
    const teamReady = DEFAULT_TEAM_ACCOUNTS.every((accountId) => accounts.has(accountId));
    const researchAccountReady = accounts.has("chatgpt-thinker") && accountHasCapability("chatgpt-thinker", "research.deep");
    return {
        software: teamReady && accounts.has("chatgpt-writer"),
        research: teamReady && researchAccountReady,
    };
}
//# sourceMappingURL=bootstrap.js.map