import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_STATES } from "#internet/browser/accounts";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
const BROWSER_ACTIONS = ["login", "status", "stop"];
/** Define the `internet_browser` lifecycle tool (login / status / stop). */
export function defineInternetBrowserTool(manager, allowed) {
    return defineTool({
        name: "internet_browser",
        description: "Manage browser-backed web providers. login opens dedicated normal Chrome locally or returns an SSH-forwarded noVNC session on displayless Linux; close local Chrome or press Save account remotely to verify the portable account. status reports account and remote-login state; stop closes inference and cancels a waiting remote login.",
        parameters: {
            action: {
                type: "string",
                required: true,
                enum: [...BROWSER_ACTIONS],
                description: "Which lifecycle action to run.",
            },
            model: {
                type: "string",
                required: true,
                enum: [...WEB_PROVIDERS],
                description: "Which provider.",
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
                    provider: { type: "string", required: true },
                    state: { type: "string", enum: [...ACCOUNT_STATES] },
                    accountPath: { type: "string" },
                    account: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            verifiedAt: { type: "string" },
                            revision: { type: "number" },
                            reauthDiagnostic: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    observedAt: { type: "string" },
                                    evidence: { type: "string", enum: ["login-url", "login-surface"] },
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
                            url: { type: "string" },
                            port: { type: "number" },
                            sshCommand: { type: "string" },
                            expiresAt: { type: "string" },
                        },
                    },
                    message: { type: "string" },
                },
            },
            render: (_args, value) => {
                const v = value;
                const summary = [`ok=${String(v.ok)}`, `provider=${String(v.provider)}`];
                if (v.state !== undefined)
                    summary.push(`state=${String(v.state)}`);
                if (v.remoteLogin?.state !== undefined)
                    summary.push(`remote=${String(v.remoteLogin.state)}`);
                const lines = [summary.join(" · ")];
                if (v.remoteLogin?.url !== undefined)
                    lines.push(`URL: ${String(v.remoteLogin.url)}`);
                if (v.remoteLogin?.sshCommand !== undefined)
                    lines.push(`SSH: ${String(v.remoteLogin.sshCommand)}`);
                if (v.message !== undefined)
                    lines.push(String(v.message));
                return [{ type: "text", text: lines.join("\n") }];
            },
            presentationMeta: (_args, value) => value,
        },
        isConcurrencySafe: () => false,
        async execute(args) {
            const model = args.model;
            if (typeof model !== "string" || !WEB_PROVIDERS.includes(model)) {
                return { ok: false, provider: String(model), message: `unknown provider ${String(model)}` };
            }
            const action = args.action;
            if (typeof action !== "string" || !BROWSER_ACTIONS.includes(action)) {
                return { ok: false, provider: model, message: `unknown action ${String(action)}` };
            }
            const remote = args.remote;
            if (remote !== undefined && typeof remote !== "boolean") {
                return { ok: false, provider: model, message: "remote must be a boolean" };
            }
            if (remote !== undefined && action !== "login") {
                return { ok: false, provider: model, message: "remote is valid only for the login action" };
            }
            const provider = model;
            if (!allowed.has(provider)) {
                return { ok: false, provider, message: `provider ${provider} is disabled in the internet plugin config` };
            }
            try {
                if (action === "login") {
                    const status = await manager.login(provider, { remote: remote === true });
                    const remoteLogin = status.remoteLogin;
                    return {
                        ok: true,
                        provider,
                        state: status.state,
                        accountPath: status.accountPath,
                        ...(status.account === undefined ? {} : { account: status.account }),
                        ...(remoteLogin === undefined ? {} : { remoteLogin }),
                        message: remoteLogin?.state === "waiting"
                            ? `Run ${remoteLogin.sshCommand}, open ${remoteLogin.url}, sign in, then press Save account.`
                            : (remoteLogin?.message ?? `${provider} portable account is verified and ready.`),
                    };
                }
                if (action === "stop") {
                    await manager.stop(provider);
                    return { ok: true, provider, message: `${provider} browser stopped.` };
                }
                const status = await manager.status(provider);
                return {
                    ok: true,
                    provider,
                    state: status.state,
                    accountPath: status.accountPath,
                    ...(status.account === undefined ? {} : { account: status.account }),
                    ...(status.remoteLogin === undefined ? {} : { remoteLogin: status.remoteLogin }),
                    message: status.remoteLogin?.message ??
                        (status.state === "ready"
                            ? `${provider} has a previously verified portable account.`
                            : status.state === "reauth-required"
                                ? `${provider} requires sign-in; run internet_browser login.`
                                : status.state === "invalid"
                                    ? `${provider} account file is invalid; run internet_browser login to replace it.`
                                    : `${provider} has no account; run internet_browser login.`),
                };
            }
            catch (error) {
                if (isInternetError(error)) {
                    return { ok: false, provider, message: `${error.kind}: ${error.message}` };
                }
                throw error;
            }
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_browser ${String(args.action)} ${String(args.model)}`,
            kind: "other",
        }),
    });
}
//# sourceMappingURL=browser.js.map