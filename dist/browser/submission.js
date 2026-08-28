import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";
/** Wait for a provider's send control to settle and become enabled after input. */
export async function waitForSendReady(provider, button, timeoutMs = 20_000) {
    await button.waitFor({ state: "visible", timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const [enabled, ariaDisabled] = await Promise.all([
            button.isEnabled().catch(() => false),
            button.getAttribute("aria-disabled").catch(() => null),
        ]);
        if (enabled && ariaDisabled !== "true")
            return;
        await sleep(100);
    }
    throw new InternetError("provider_error", `${provider} send button did not become enabled after attaching the prompt`);
}
//# sourceMappingURL=submission.js.map