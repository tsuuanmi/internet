/** A single polled view of the current provider response surface. */
export interface CompletionSnapshot {
    responsePresent: boolean;
    /** Current visible text of the latest response. */
    text: string;
    /** Latest response innerHTML, used to render canonical markdown. */
    html: string;
    /** Whether a "stop generation" control is currently visible (still running). */
    running: boolean;
}
export interface WaitOptions {
    timeoutMs: number;
    pollMs: number;
    stableMs: number;
    signal?: AbortSignal;
}
/**
 * Poll the provider response surface until it is present and its text stays
 * unchanged for `stableMs` while generation is not running, or until the
 * deadline. Returns the stable rendered text as canonical markdown. This
 * mirrors the completion policy of pi-internet's Gemini driver and is
 * intentionally conservative: an unchanged-but-still-running response is never
 * treated as complete.
 */
export declare function waitForStableCompletion(read: () => Promise<CompletionSnapshot>, options: WaitOptions): Promise<string>;
//# sourceMappingURL=completion.d.ts.map