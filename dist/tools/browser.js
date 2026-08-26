import { defineTool } from "@deepseek-ai/dsh-tools";
import { WEB_PROVIDERS } from "#internet/core/config";
import { isInternetError } from "#internet/core/errors";
const BROWSER_ACTIONS = ["login", "status", "stop"];
/** Define the `internet_browser` lifecycle tool (login / status / stop). */
export function defineInternetBrowserTool(manager, allowed) {
    return defineTool({
        name: "internet_browser",
        description: "Manage browser-backed web providers. login opens dedicated normal Chrome with no automation flags; sign in, then close that window completely so the plugin can export and verify the session. status reports whether verified state exists; stop closes the inference browser.",
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
                    loggedIn: { type: "boolean" },
                    storageStatePath: { type: "string" },
                    message: { type: "string" },
                },
            },
            render: (_args, value) => {
                const v = value;
                const parts = [`ok=${String(v.ok)}`, `provider=${String(v.provider)}`];
                if (v.loggedIn !== undefined)
                    parts.push(`loggedIn=${String(v.loggedIn)}`);
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
                        loggedIn: status.loggedIn,
                        storageStatePath: status.storageStatePath,
                        message: `${provider} is signed in and ready.`,
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
                    loggedIn: status.loggedIn,
                    storageStatePath: status.storageStatePath,
                    message: status.loggedIn
                        ? `${provider} is signed in.`
                        : `${provider} is not signed in; run internet_browser login first.`,
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