import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_STATES } from "#internet/browser/accounts";
import type { BrowserManager } from "#internet/browser/runtime";
import { ACCOUNT_IDS, type AccountId, getAccountDefinition, isAccountId } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";

export type InternetBrowserAction = "login" | "status" | "stop";

const INTERNET_BROWSER_ACTIONS: readonly InternetBrowserAction[] = ["login", "status", "stop"];

/** Define the `internet_browser` lifecycle tool (login / status / stop) per account. */
export function defineInternetBrowserTool(
	manager: BrowserManager,
	allowed: ReadonlySet<AccountId>,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_browser",
		description:
			"Manage browser-backed authenticated accounts. login opens a dedicated normal Chrome profile for the exact account locally or returns an SSH-forwarded noVNC session; status and stop are also account-scoped.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [...INTERNET_BROWSER_ACTIONS],
				description: "Which lifecycle action to run.",
			},
			account: {
				type: "string",
				required: true,
				enum: [...ACCOUNT_IDS],
				description: "Exact authenticated account identity.",
			},
			remote: {
				type: "boolean",
				description: "Force SSH-forwarded noVNC login; displayless Linux selects it automatically.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean", required: true },
					accountId: { type: "string", required: true },
					provider: { type: "string", required: true },
					state: { type: "string", enum: [...ACCOUNT_STATES] },
					accountPath: { type: "string" },
					account: {
						type: "object",
						additionalProperties: false,
						properties: {
							verifiedAt: { type: "string", required: true },
							revision: { type: "number", required: true },
							reauthDiagnostic: {
								type: "object",
								additionalProperties: false,
								properties: {
									observedAt: { type: "string", required: true },
									evidence: { type: "string", enum: ["login-url", "login-surface"], required: true },
								},
							},
						},
					},
					remoteLogin: {
						type: "object",
						additionalProperties: false,
						properties: {
							state: { type: "string", required: true },
							message: { type: "string", required: true },
							sshCommand: { type: "string" },
							url: { type: "string" },
							port: { type: "number" },
							expiresAt: { type: "string" },
						},
					},
					message: { type: "string" },
				},
			},
			render: (_args, value) => {
				const v = value as {
					ok?: unknown;
					accountId?: unknown;
					provider?: unknown;
					state?: unknown;
					remoteLogin?: { state?: unknown; url?: unknown; sshCommand?: unknown };
					message?: unknown;
				};
				const summary = [`ok=${String(v.ok)}`, `account=${String(v.accountId)}`, `provider=${String(v.provider)}`];
				if (v.state !== undefined) summary.push(`state=${String(v.state)}`);
				if (v.remoteLogin?.state !== undefined) summary.push(`remote=${String(v.remoteLogin.state)}`);
				const lines = [summary.join(" · ")];
				if (v.remoteLogin?.sshCommand !== undefined) lines.push(`SSH: ${String(v.remoteLogin.sshCommand)}`);
				if (v.remoteLogin?.url !== undefined) lines.push(`URL: ${String(v.remoteLogin.url)}`);
				if (v.message !== undefined) lines.push(String(v.message));
				return [{ type: "text", text: lines.join("\n") }];
			},
			presentationMeta: (_args, value) => value,
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const rawAccount = args.account;
			if (!isAccountId(rawAccount)) {
				return {
					ok: false,
					accountId: String(rawAccount),
					provider: "unknown",
					message: `unknown account ${String(rawAccount)}`,
				};
			}
			const accountId = rawAccount;
			const provider = getAccountDefinition(accountId).provider;
			const action = args.action;
			if (typeof action !== "string" || !(INTERNET_BROWSER_ACTIONS as readonly string[]).includes(action)) {
				return { ok: false, accountId, provider, message: `unknown action ${String(action)}` };
			}
			const remote = args.remote;
			if (remote !== undefined && typeof remote !== "boolean") {
				return { ok: false, accountId, provider, message: "remote must be a boolean" };
			}
			if (remote !== undefined && action !== "login") {
				return { ok: false, accountId, provider, message: "remote is valid only for the login action" };
			}
			if (!allowed.has(accountId)) {
				return {
					ok: false,
					accountId,
					provider,
					message: `account ${accountId} is disabled in the internet plugin config`,
				};
			}
			try {
				if (action === "login") {
					const status = await manager.login(accountId, { remote: remote === true });
					const remoteLogin = status.remoteLogin;
					return {
						ok: true,
						accountId,
						provider,
						state: status.state,
						accountPath: status.accountPath,
						...(status.account === undefined ? {} : { account: status.account }),
						...(remoteLogin === undefined ? {} : { remoteLogin }),
						message:
							remoteLogin?.state === "waiting"
								? `First run ${remoteLogin.sshCommand}, then open ${remoteLogin.url}, sign in to ${accountId}, and press Save account. This login expires at ${remoteLogin.expiresAt}.`
								: (remoteLogin?.message ?? `${accountId} portable account is verified and ready.`),
					};
				}
				if (action === "stop") {
					await manager.stop(accountId);
					return { ok: true, accountId, provider, message: `${accountId} browser stopped.` };
				}
				const status = await manager.status(accountId);
				return {
					ok: true,
					accountId,
					provider,
					state: status.state,
					accountPath: status.accountPath,
					...(status.account === undefined ? {} : { account: status.account }),
					...(status.remoteLogin === undefined ? {} : { remoteLogin: status.remoteLogin }),
					message:
						status.remoteLogin?.message ??
						(status.state === "ready"
							? `${accountId} has a previously verified portable account.`
							: status.state === "reauth-required"
								? `${accountId} requires sign-in; run internet_browser login.`
								: status.state === "invalid"
									? `${accountId} account file is invalid; run internet_browser login to replace it.`
									: `${accountId} has no account; run internet_browser login.`),
				};
			} catch (error) {
				if (isInternetError(error)) {
					return { ok: false, accountId, provider, message: `${error.kind}: ${error.message}` };
				}
				throw error;
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `internet_browser ${String(args.action)} ${String(args.account)}`,
			kind: "other",
		}),
	});
}
