import { InternetError } from "#internet/core/errors";
import { sleep } from "#internet/core/sleep";
/**
 * Preserve the latest conclusive observation over later transient/unknown
 * states. Authenticated is terminal; signed-out and challenge replace each
 * other (latest wins); unconfirmed never overrides a conclusive state.
 */
export function latestConclusiveAssessment(current, next) {
    if (current.state === "authenticated")
        return current;
    if (next.state === "authenticated")
        return next;
    if (next.state === "unconfirmed")
        return current;
    return next;
}
/**
 * Shared authentication polling. Samples a provider-specific assessment at
 * 200ms intervals until authenticated or the deadline expires, retaining the
 * latest conclusive observation. Aborts immediately on signal cancellation.
 */
export async function waitAuthenticationAssessment(assess, timeoutMs, signal) {
    const deadline = Date.now() + timeoutMs;
    let latest = await assess();
    while (Date.now() < deadline) {
        if (signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted");
        }
        if (latest.state === "authenticated")
            return latest;
        await sleep(200, signal);
        latest = latestConclusiveAssessment(latest, await assess());
    }
    return latest;
}
//# sourceMappingURL=authentication.js.map