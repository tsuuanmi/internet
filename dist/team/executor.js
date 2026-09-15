import { getAccountDefinition } from "#internet/core/accounts";
import { InternetError, isInternetError } from "#internet/core/errors";
import { prepareTeamStep } from "#internet/team/plan";
function now() {
    return new Date().toISOString();
}
function emit(observer, event) {
    if (observer === undefined)
        return;
    try {
        observer(event);
    }
    catch {
        // Observability never changes team correctness.
    }
}
function assertNotAborted(signal) {
    if (!signal?.aborted)
        return;
    throw signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "team debate aborted");
}
function failureKind(error) {
    if (isInternetError(error))
        return error.kind;
    if (error instanceof Error && error.name === "AbortError")
        return "aborted";
    return "unexpected_error";
}
function retryable(kind) {
    return (kind === "browser_unavailable" || kind === "provider_error" || kind === "provider_stalled" || kind === "timeout");
}
function failureDetail(error, accountId, stage, round) {
    const kind = failureKind(error);
    return {
        accountId,
        provider: getAccountDefinition(accountId).provider,
        stage,
        ...(round === undefined ? {} : { round }),
        kind,
        message: error instanceof Error ? error.message : String(error),
        retryable: retryable(kind),
        failedAt: now(),
    };
}
function requestFor(options, prompt) {
    return {
        prompt,
        sessionId: options.sessionId,
        requestKey: options.requestKey,
        visible: options.visible,
        timeoutMs: options.timeoutMs,
        stallTimeoutMs: options.stallTimeoutMs,
        onProgress: options.onProviderProgress,
        signal: options.signal,
    };
}
export async function runTeamStep(chat, options) {
    if (options.sessionId.trim() === "")
        throw new Error("team debate sessionId must not be empty");
    const { step } = options;
    const provider = getAccountDefinition(step.accountId).provider;
    let stage = step.kind === "member" ? "prepare_prompt" : "synthesis";
    try {
        assertNotAborted(options.signal);
        if (step.kind === "member") {
            emit(options.onProgress, {
                at: now(),
                stage,
                status: "started",
                round: step.round,
                accountId: step.accountId,
                provider,
            });
            const prepared = prepareTeamStep(options.plan, step, options.task, options.transcript, options.promptStrategy);
            emit(options.onProgress, {
                at: now(),
                stage,
                status: "completed",
                round: step.round,
                accountId: step.accountId,
                provider,
            });
            stage = "provider_turn";
            emit(options.onProgress, {
                at: now(),
                stage,
                status: "started",
                round: step.round,
                accountId: step.accountId,
                provider,
            });
            const result = await chat(step.accountId, requestFor(options, prepared.prompt));
            const turn = { round: step.round, accountId: step.accountId, provider, text: result.text };
            emit(options.onProgress, {
                at: now(),
                stage,
                status: "completed",
                round: step.round,
                accountId: step.accountId,
                provider,
                text: result.text,
            });
            return { ok: true, step, turn };
        }
        const prepared = prepareTeamStep(options.plan, step, options.task, options.transcript, options.promptStrategy);
        emit(options.onProgress, { at: now(), stage, status: "started", accountId: step.accountId, provider });
        const result = await chat(step.accountId, requestFor(options, prepared.prompt));
        emit(options.onProgress, {
            at: now(),
            stage,
            status: "completed",
            accountId: step.accountId,
            provider,
            text: result.text,
        });
        return { ok: true, step, finalAnswer: result.text };
    }
    catch (error) {
        const failure = failureDetail(error, step.accountId, stage, step.kind === "member" ? step.round : undefined);
        emit(options.onProgress, {
            at: failure.failedAt,
            stage: failure.stage,
            status: "failed",
            ...(failure.round === undefined ? {} : { round: failure.round }),
            accountId: failure.accountId,
            provider: failure.provider,
            kind: failure.kind,
            message: failure.message,
            retryable: failure.retryable,
        });
        return { ok: false, error: failure };
    }
}
//# sourceMappingURL=executor.js.map