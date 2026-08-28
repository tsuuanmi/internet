import { InternetError } from "#internet/core/errors";
export interface ProviderLease {
    generation: number;
    /** Aborts when the caller cancels, the provider is invalidated, or it closes. */
    signal: AbortSignal;
}
/**
 * Bounded provider scheduler. Different sessions may occupy the configured
 * capacity, while each native conversation session remains strictly ordered.
 * A queued exclusive lifecycle job is a FIFO fence: earlier turns drain, then
 * the exclusive work runs before any later turn begins.
 */
export declare class ProviderScheduler {
    private readonly capacity;
    private readonly queue;
    private readonly activeSessions;
    private readonly activeJobs;
    private readonly idleWaiters;
    private active;
    private exclusive;
    private generation;
    private closed;
    constructor(capacity: number);
    get isIdle(): boolean;
    currentGeneration(): number;
    isCurrent(lease: ProviderLease): boolean;
    /** Invalidate all leases, reject queued work, and abort active work. */
    invalidate(reason: Error): void;
    waitForIdle(): Promise<void>;
    close(reason?: InternetError): void;
    runTurn<T>(sessionId: string, signal: AbortSignal | undefined, work: (lease: ProviderLease) => Promise<T>): Promise<T>;
    runExclusive<T>(work: (lease: ProviderLease) => Promise<T>): Promise<T>;
    private drive;
    private nextRunnable;
    private start;
    private abortActive;
    private rejectQueued;
    private notifyIdle;
}
//# sourceMappingURL=provider-scheduler.d.ts.map