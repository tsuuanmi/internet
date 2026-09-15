export interface CompletionSnapshot {
    responsePresent: boolean;
    text: string;
    html: string;
    running: boolean;
}
export type ProviderProgressKind = "response_started" | "response_changed" | "generation_started" | "generation_stopped";
export interface ProviderProgressEvent {
    readonly kind: ProviderProgressKind;
    readonly at: string;
}
export interface WaitOptions {
    /** Absolute hard deadline for this provider turn. */
    timeoutMs: number;
    /** Optional no-meaningful-progress deadline; must be lower than timeoutMs. */
    stallTimeoutMs?: number;
    pollMs: number;
    stableMs: number;
    signal?: AbortSignal;
    onProgress?: (event: ProviderProgressEvent) => void;
}
/**
 * Wait for a stable completed response while distinguishing a hard deadline
 * from a semantic no-progress stall. Only response/running transitions renew
 * the progress lease; unrelated DOM churn and a static thinking control do not.
 */
export declare function waitForStableCompletion(read: () => Promise<CompletionSnapshot>, options: WaitOptions): Promise<string>;
//# sourceMappingURL=completion.d.ts.map