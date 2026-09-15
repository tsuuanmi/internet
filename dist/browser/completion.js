import { InternetError } from "#internet/core/errors";
function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"));
        }, { once: true });
    });
}
function emitProgress(observer, kind, at) {
    if (observer === undefined)
        return;
    try {
        observer({ kind, at: new Date(at).toISOString() });
    }
    catch {
        // Progress projection must never change provider-turn correctness.
    }
}
/**
 * Wait for a stable completed response while distinguishing a hard deadline
 * from a semantic no-progress stall. Only response/running transitions renew
 * the progress lease; unrelated DOM churn and a static thinking control do not.
 */
export async function waitForStableCompletion(read, options) {
    if (options.stallTimeoutMs !== undefined && options.stallTimeoutMs >= options.timeoutMs) {
        throw new InternetError("config_error", "completion stallTimeoutMs must be lower than timeoutMs");
    }
    const startedAt = Date.now();
    const deadline = startedAt + options.timeoutMs;
    let lastMeaningfulProgressAt = startedAt;
    let previous;
    let candidate;
    let stableSince;
    while (Date.now() < deadline) {
        if (options.signal?.aborted) {
            throw options.signal.reason instanceof Error
                ? options.signal.reason
                : new InternetError("aborted", "browser turn aborted");
        }
        const snapshot = await read();
        const at = Date.now();
        const text = snapshot.text.trim();
        const responseTransition = previous === undefined || snapshot.responsePresent !== previous.responsePresent;
        if (responseTransition) {
            if (snapshot.responsePresent)
                emitProgress(options.onProgress, "response_started", at);
            lastMeaningfulProgressAt = at;
        }
        if (previous === undefined || snapshot.running !== previous.running) {
            emitProgress(options.onProgress, snapshot.running ? "generation_started" : "generation_stopped", at);
            lastMeaningfulProgressAt = at;
        }
        if (previous !== undefined && !responseTransition && text !== previous.text.trim()) {
            emitProgress(options.onProgress, "response_changed", at);
            lastMeaningfulProgressAt = at;
        }
        previous = snapshot;
        if (snapshot.responsePresent && text.length > 0) {
            const unchanged = candidate !== undefined && candidate.text === text;
            if (!snapshot.running && unchanged) {
                stableSince ??= at;
                if (at - stableSince >= options.stableMs) {
                    return { text, html: snapshot.html };
                }
            }
            else {
                stableSince = undefined;
            }
            candidate = { text, html: snapshot.html };
        }
        else {
            candidate = undefined;
            stableSince = undefined;
        }
        if (options.stallTimeoutMs !== undefined && at - lastMeaningfulProgressAt >= options.stallTimeoutMs) {
            throw new InternetError("provider_stalled", `browser provider made no meaningful progress for ${options.stallTimeoutMs}ms`);
        }
        await delay(options.pollMs, options.signal);
    }
    throw new InternetError("timeout", `browser provider did not complete within ${options.timeoutMs}ms`);
}
//# sourceMappingURL=completion.js.map