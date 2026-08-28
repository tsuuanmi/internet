import { InternetError } from "#internet/core/errors";
export interface ProviderLease {
    generation: number;
}
/**
 * Bounded provider scheduler. Different sessions may occupy the configured
 * capacity, while each native conversation session remains strictly ordered.
 * Exclusive lifecycle work forms a FIFO barrier after earlier turns drain.
 */
export declare class ProviderScheduler {
    private readonly capacity;
    private readonly queue;
    private readonly activeSessions;
    private readonly idleWaiters;
    private active;
    private exclusive;
    private generation;
    private closed;
    constructor(capacity: number);
    get isIdle(): boolean;
    currentGeneration(): number;
    isCurrent(lease: ProviderLease): boolean;
    /** Invalidate leases and reject queued work without interrupting running work. */
    invalidate(reason: Error): void;
    waitForIdle(): Promise<void>;
    close(reason?: InternetError): void;
    runTurn<T>(sessionId: string, signal: AbortSignal | undefined, work: (lease: ProviderLease) => Promise<T>): Promise<T>;
    runExclusive<T>(work: (lease: ProviderLease) => Promise<T>): Promise<T>;
    private drive;
    private nextRunnable;
    private start;
    private rejectQueued;
    private notifyIdle;
}
//# sourceMappingURL=provider-scheduler.d.ts.map