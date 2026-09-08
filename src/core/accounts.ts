import type { WebProvider } from "#internet/core/config";

/** Stable semantic account identities used by workflow routing. */
export const ACCOUNT_IDS = ["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"] as const;
export type AccountId = (typeof ACCOUNT_IDS)[number];

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

/**
 * Initial semantic account catalog. These definitions describe intended
 * workflow routing and authority boundaries; later multi-account work binds
 * each identity to isolated portable browser state.
 */
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
};

/**
 * Compatibility route for existing provider-keyed APIs while the browser
 * runtime migrates to first-class account IDs. Existing ChatGPT/Gemini calls
 * continue to address the thinker accounts; the writer is never selected
 * implicitly from a provider name.
 */
export const DEFAULT_ACCOUNT_BY_PROVIDER: Readonly<Record<WebProvider, AccountId>> = {
	"chatgpt-web": "chatgpt-thinker",
	"gemini-web": "gemini-thinker",
};

export function isAccountId(value: unknown): value is AccountId {
	return typeof value === "string" && (ACCOUNT_IDS as readonly string[]).includes(value);
}

export function getAccountDefinition(accountId: AccountId): AccountDefinition {
	return ACCOUNTS[accountId];
}

export function defaultAccountIdForProvider(provider: WebProvider): AccountId {
	return DEFAULT_ACCOUNT_BY_PROVIDER[provider];
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
