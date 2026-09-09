import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_STATES } from "#internet/browser/accounts";
import { ACCOUNT_IDS, getAccountDefinition, isAccountId } from "#internet/core/accounts";
import { isInternetError } from "#internet/core/errors";
const INTERNET_BROWSER_ACTIONS = [
    "login",
    "status",
    "stop",
    "login_all",
    "status_all",
    "stop_all",
];
function isBatchAction(action) {
    return action.endsWith("_all");
}
function batchAccounts(allowed) {
    return ACCOUNT_IDS.filter((accountId) => allowed.has(accountId));
}
function summarizeStatus(status) {
    const remoteLogin = status.remoteLogin;
    if (remoteLogin !== undefined) {
        const port = remoteLogin.port === undefined ? "" : `(port=${remoteLogin.port})`;
        return `${status.accountId}=login-${remoteLogin.state}${port}`;
    }
    return `${status.accountId}=${status.state}`;
}
function summarizeStatuses(statuses) {
    return statuses.map(summarizeStatus).join(", ");
}
function loginManifest(statuses) {
    const entries = statuses.flatMap((status) => {
        const remoteLogin = status.remoteLogin;
        if (remoteLogin === undefined)
            return [];
        return [
            [
                `${status.accountId}: state=${remoteLogin.state}${remoteLogin.port === undefined ? "" : ` port=${remoteLogin.port}`}`,
                ...(remoteLogin.url === undefined ? [] : [`  URL: ${remoteLogin.url}`]),
                ...(remoteLogin.expiresAt === undefined ? [] : [`  Expires: ${remoteLogin.expiresAt}`]),
            ].join("\n"),
        ];
    });
    return entries.length === 0 ? undefined : entries.join("\n");
}
function batchSshCommand(statuses) {
    const ports = statuses.flatMap((status) => {
        const port = status.remoteLogin?.port;
        return port === undefined ? [] : [port];
    });
    if (ports.length === 0)
        return undefined;
    return `ssh -N ${ports.map((port) => `-L ${port}:127.0.0.1:${port}`).join(" ")} <user>@<server>`;
}
function singleResult(accountId, status, message) {
    const provider = getAccountDefinition(accountId).provider;
    const remoteLogin = status.remoteLogin;
    return {
        ok: true,
        accountId,
        provider,
        state: status.state,
        accountPath: status.accountPath,
        ...(status.account === undefined ? {} : { account: status.account }),
        ...(remoteLogin === undefined ? {} : { remoteLogin }),
        message: message ??
            (remoteLogin?.state === "waiting"
                ? `Open ${remoteLogin.url} on this server, or forward port ${String(remoteLogin.port)} with ${remoteLogin.sshCommand} from another machine and open the same URL there. Sign in to ${accountId}, then press Save account. Do not close Chrome manually; Save account closes the login desktop and verifies the portable account. This login expires at ${remoteLogin.expiresAt}.`
                : (remoteLogin?.message ?? `${accountId} portable account is verified and ready.`)),
    };
}
/** Define the `internet_browser` lifecycle tool, including batch account bootstrap/status/stop. */
export function defineInternetBrowserTool(manager, allowed) {
    return defineTool({
        name: "internet_browser",
        description: "Manage isolated browser-backed authenticated accounts. Every login uses a loopback noVNC desktop on a stable account-specific port; open it directly on the server or through SSH port forwarding from another machine. login_all/status_all/stop_all operate on all enabled semantic accounts in parallel while preserving per-account lifecycle locks.",
        parameters: {
            action: {
                type: "string",
                required: true,
                enum: [...INTERNET_BROWSER_ACTIONS],
                description: "Which lifecycle action to run.",
            },
            account: {
                type: "string",
                enum: [...ACCOUNT_IDS],
                description: "Exact authenticated account identity for non-batch actions.",
            },
            remote: {
                type: "boolean",
                description: "Deprecated compatibility flag. Login always uses the same invisible loopback noVNC port flow whether the operator is local or connecting through SSH forwarding.",
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    ok: { type: "boolean", required: true },
                    action: { type: "string" },
                    accountId: { type: "string" },
                    provider: { type: "string" },
                    state: { type: "string", enum: [...ACCOUNT_STATES] },
                    accountPath: { type: "string" },
                    accounts: { type: "string" },
                    remoteLogins: { type: "string" },
                    batchSshCommand: { type: "string" },
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
                const v = value;
                const summary = [`ok=${String(v.ok)}`];
                if (v.action !== undefined)
                    summary.push(`action=${String(v.action)}`);
                if (v.accountId !== undefined)
                    summary.push(`account=${String(v.accountId)}`);
                if (v.provider !== undefined)
                    summary.push(`provider=${String(v.provider)}`);
                if (v.state !== undefined)
                    summary.push(`state=${String(v.state)}`);
                if (v.accounts !== undefined)
                    summary.push(String(v.accounts));
                if (v.remoteLogin?.state !== undefined)
                    summary.push(`login=${String(v.remoteLogin.state)}`);
                const lines = [summary.join(" · ")];
                if (v.remoteLogin?.url !== undefined)
                    lines.push(`URL: ${String(v.remoteLogin.url)}`);
                if (v.remoteLogin?.sshCommand !== undefined)
                    lines.push(`SSH: ${String(v.remoteLogin.sshCommand)}`);
                if (v.remoteLogins !== undefined)
                    lines.push(String(v.remoteLogins));
                if (v.batchSshCommand !== undefined)
                    lines.push(`SSH all: ${String(v.batchSshCommand)}`);
                if (v.message !== undefined)
                    lines.push(String(v.message));
                return [{ type: "text", text: lines.join("\n") }];
            },
            presentationMeta: (_args, value) => value,
        },
        isConcurrencySafe: () => false,
        async execute(args) {
            const action = args.action;
            if (typeof action !== "string" || !INTERNET_BROWSER_ACTIONS.includes(action)) {
                return { ok: false, action: String(action), message: `unknown action ${String(action)}` };
            }
            const typedAction = action;
            const remote = args.remote;
            if (remote !== undefined && typeof remote !== "boolean") {
                return { ok: false, action, message: "remote must be a boolean" };
            }
            if (remote !== undefined && typedAction !== "login" && typedAction !== "login_all") {
                return { ok: false, action, message: "remote is valid only for login and login_all" };
            }
            if (isBatchAction(typedAction)) {
                const accounts = batchAccounts(allowed);
                if (accounts.length === 0)
                    return { ok: false, action, message: "no enabled internet accounts" };
                const results = await Promise.all(accounts.map(async (accountId) => {
                    try {
                        if (typedAction === "login_all")
                            return await manager.login(accountId, { remote: true });
                        if (typedAction === "stop_all") {
                            await manager.stop(accountId);
                            return await manager.status(accountId);
                        }
                        return await manager.status(accountId);
                    }
                    catch (error) {
                        return {
                            accountId,
                            error: isInternetError(error) ? `${error.kind}: ${error.message}` : String(error),
                        };
                    }
                }));
                const failures = results.filter((item) => "error" in item);
                const statuses = results.filter((item) => "state" in item);
                const summary = [
                    ...(statuses.length === 0 ? [] : [summarizeStatuses(statuses)]),
                    ...failures.map((failure) => `${failure.accountId}=error:${failure.error}`),
                ].join(", ");
                const remoteLogins = loginManifest(statuses);
                const sshAll = batchSshCommand(statuses);
                const waitingLogins = statuses.filter((status) => status.remoteLogin?.state === "waiting" || status.remoteLogin?.state === "finalizing").length;
                return {
                    ok: failures.length === 0,
                    action,
                    accounts: summary,
                    ...(remoteLogins === undefined ? {} : { remoteLogins }),
                    ...(sshAll === undefined ? {} : { batchSshCommand: sshAll }),
                    message: failures.length > 0
                        ? `${typedAction} completed with ${failures.length} account failure(s).`
                        : typedAction === "login_all" && waitingLogins > 0
                            ? `Invisible login is ready for ${waitingLogins} account(s). On this server, open each URL above directly. From another machine, run the SSH all command once and open the same URLs locally. Sign in to the named account in each desktop, then press Save account. Do not close Chrome manually.`
                            : `${typedAction} completed for ${accounts.length} enabled accounts.`,
                };
            }
            const rawAccount = args.account;
            if (!isAccountId(rawAccount)) {
                return {
                    ok: false,
                    action,
                    accountId: String(rawAccount),
                    provider: "unknown",
                    message: "account is required",
                };
            }
            const accountId = rawAccount;
            const provider = getAccountDefinition(accountId).provider;
            if (!allowed.has(accountId)) {
                return {
                    ok: false,
                    action,
                    accountId,
                    provider,
                    message: `account ${accountId} is disabled in the internet plugin config`,
                };
            }
            try {
                if (typedAction === "login") {
                    return {
                        action,
                        ...singleResult(accountId, await manager.login(accountId, { remote: true })),
                    };
                }
                if (typedAction === "stop") {
                    await manager.stop(accountId);
                    return { ok: true, action, accountId, provider, message: `${accountId} browser stopped.` };
                }
                const status = await manager.status(accountId);
                return {
                    action,
                    ...singleResult(accountId, status, status.remoteLogin?.message ??
                        (status.state === "ready"
                            ? `${accountId} has a previously verified portable account.`
                            : status.state === "reauth-required"
                                ? `${accountId} requires sign-in; run internet_browser login.`
                                : status.state === "invalid"
                                    ? `${accountId} account file is invalid; run internet_browser login to replace it.`
                                    : `${accountId} has no account; run internet_browser login.`)),
                };
            }
            catch (error) {
                if (isInternetError(error))
                    return { ok: false, action, accountId, provider, message: `${error.kind}: ${error.message}` };
                throw error;
            }
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_browser ${String(args.action)}${args.account === undefined ? "" : ` ${String(args.account)}`}`,
            kind: "other",
        }),
    });
}
//# sourceMappingURL=internet-browser.js.map