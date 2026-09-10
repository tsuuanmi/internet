import type { WebProvider } from "#internet/core/config";

/** Stable semantic account identities used by workflow routing. */
export const ACCOUNT_IDS = ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker", "chatgpt-thinker-2"] as const;
export type AccountId = (typeof ACCOUNT_IDS)[number];

/** Default independent reasoning members used by team/workflow execution. */
export const DEFAULT_TEAM_ACCOUNTS: readonly [AccountId, AccountId] = ["chatgpt-thinker", "chatgpt-thinker-2"];
export const DEFAULT_TEAM_SYNTHESIZER: AccountId = "chatgpt-thinker";

/** Coarse workflow role; capabilities provide the authoritative routing detail. */
export const ACCOUNT_ROLES = ["thinker", "writer"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Capabilities the workflow runtime may require when selecting an account. */
export const ACCOUNT_CAPABILITIES = [
	"browser.chat",
	"team.reason",
	"team.review",
	"team.synthesize",
	"github.read",
	"github.write",
	"github.pull_request",
	"github.merge",
] as const;
export type AccountCapability = (typeof ACCOUNT_CAPABILITIES)[number];

export interface AccountDefinition {
	accountId: AccountId;
	provider: WebProvider;
	role: AccountRole;
	capabilities: readonly AccountCapability[];
}

/** Authenticated account catalog. Team roles are assigned by ordered membership, not provider identity. */
export const ACCOUNTS: Readonly<Record<AccountId, AccountDefinition>> = {
	"chatgpt-thinker": {
		accountId: "chatgpt-thinker",
		provider: "chatgpt-web",
		role: "thinker",
		capabilities: ["browser.chat", "team.reason", "team.review", "team.synthesize", "github.read"],
	},
	"chatgpt-writer": {
		accountId: "chatgpt-writer",
		provider: "chatgpt-web",
		role: "writer",
		capabilities: ["browser.chat", "github.read", "github.write", "github.pull_request", "github.merge"],
	},
	"gemini-thinker": {
		accountId: "gemini-thinker",
		provider: "gemini-web",
		role: "thinker",
		capabilities: ["browser.chat", "team.reason", "team.review", "github.read"],
	},
	"chatgpt-thinker-2": {
		accountId: "chatgpt-thinker-2",
		provider: "chatgpt-web",
		role: "thinker",
		capabilities: ["browser.chat", "team.reason", "team.review", "team.synthesize", "github.read"],
	},
};

export function isAccountId(value: unknown): value is AccountId {
	return typeof value === "string" && (ACCOUNT_IDS as readonly string[]).includes(value);
}

export function getAccountDefinition(accountId: AccountId): AccountDefinition {
	return ACCOUNTS[accountId];
}

/** Return every semantic account backed by one provider in stable catalog order. */
export function accountsForProvider(provider: WebProvider): AccountDefinition[] {
	return ACCOUNT_IDS.map((accountId) => ACCOUNTS[accountId]).filter((account) => account.provider === provider);
}

export function accountHasCapability(accountId: AccountId, capability: AccountCapability): boolean {
	return ACCOUNTS[accountId].capabilities.includes(capability);
}

/** Select known accounts that satisfy every requested capability. */
export function accountsWithCapabilities(required: readonly AccountCapability[]): AccountDefinition[] {
	return ACCOUNT_IDS.map((accountId) => ACCOUNTS[accountId]).filter((account) =>
		required.every((capability) => account.capabilities.includes(capability)),
	);
}
