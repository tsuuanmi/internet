import type { Locator } from "patchright-core";
import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";

/** Wait for a provider's send control to settle and become enabled after input. */
export async function waitForSendReady(provider: string, button: Locator, timeoutMs = 20_000): Promise<void> {
	await button.waitFor({ state: "visible", timeout: timeoutMs });
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await button.isEnabled().catch(() => false)) return;
		await sleep(100);
	}
	throw new InternetError(
		"provider_error",
		`${provider} send button did not become enabled after attaching the prompt`,
	);
}
