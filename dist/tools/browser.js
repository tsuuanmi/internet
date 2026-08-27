import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_STATES } from "#internet/browser/accounts";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
const BROWSER_ACTIONS = ["login", "status", "stop"];
/** Define the `internet_browser` lifecycle tool (login / status / stop). */
export function defineInternetBrowserTool(manager, allowed) {
    return defineTool({
        name: "internet_browser",
        description: "Manage browser-backed web providers. login opens dedicated normal Chrome with no automation flags; sign in, then close that window completely so the plugin can write a portable verified account. status inspects local account state; stop closes the inference browser.",
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
                    message: { type: "string" },
                },
            },
            render: (_args, value) => {
                const v = value;
                const parts = [`ok=${String(v.ok)}`, `provider=${String(v.provider)}`];
                if (v.state !== undefined)
                    parts.push(`state=${String(v.state)}`);
                if (v.message !== undefined)
                    parts.push(String(v.message));
                return [{ type: "text", text: parts.join(" · ") }];
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
            const provider = model;
            if (!allowed.has(provider)) {
                return { ok: false, provider, message: `provider ${provider} is disabled in the internet plugin config` };
            }
            try {
                if (action === "login") {
                    const status = await manager.login(provider);
                    return {
                        ok: true,
                        provider,
                        state: status.state,
                        accountPath: status.accountPath,
                        message: `${provider} portable account is verified and ready.`,
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
                    message: status.state === "ready"
                        ? `${provider} has a previously verified portable account.`
                        : status.state === "reauth-required"
                            ? `${provider} requires sign-in; run internet_browser login.`
                            : status.state === "invalid"
                                ? `${provider} account file is invalid; run internet_browser login to replace it.`
                                : `${provider} has no account; run internet_browser login.`,
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