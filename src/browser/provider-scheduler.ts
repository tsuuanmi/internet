import { InternetError } from "#internet/core/errors";

export interface ProviderLease {
	generation: number;
	/** Aborts when the caller cancels, the provider is invalidated, or it closes. */
	signal: AbortSignal;
}

type TurnJob<T> = {
	kind: "turn";
	sessionId: string;
	signal?: AbortSignal;
	work: (lease: ProviderLease) => Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
	abort?: () => void;
};

type ExclusiveJob<T> = {
	kind: "exclusive";
	work: (lease: ProviderLease) => Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
};

type Job<T> = TurnJob<T> | ExclusiveJob<T>;

type ActiveJob = {
	controller: AbortController;
	externalAbort?: () => void;
};

/**
 * Bounded provider scheduler. Different sessions may occupy the configured
 * capacity, while each native conversation session remains strictly ordered.
 * A queued exclusive lifecycle job is a FIFO fence: earlier turns drain, then
 * the exclusive work runs before any later turn begins.
 */
export class ProviderScheduler {
	private readonly capacity: number;
	private readonly queue: Job<unknown>[] = [];
	private readonly activeSessions = new Set<string>();
	private readonly activeJobs = new Set<ActiveJob>();
	private readonly idleWaiters = new Set<() => void>();
	private active = 0;
	private exclusive = false;
	private generation = 0;
	private closed: Error | undefined;

	constructor(capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1)
			throw new Error("provider scheduler capacity must be a positive integer");
		this.capacity = capacity;
	}

	get isIdle(): boolean {
		return this.active === 0 && this.queue.length === 0;
	}

	currentGeneration(): number {
		return this.generation;
	}

	isCurrent(lease: ProviderLease): boolean {
		return this.closed === undefined && lease.generation === this.generation && !lease.signal.aborted;
	}

	/** Invalidate all leases, reject queued work, and abort active work. */
	invalidate(reason: Error): void {
		this.generation += 1;
		this.rejectQueued(reason);
		this.abortActive(reason);
	}

	async waitForIdle(): Promise<void> {
		if (this.isIdle) return;
		await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
	}

	close(reason = new InternetError("aborted", "provider scheduler closed")): void {
		if (this.closed !== undefined) return;
		this.closed = reason;
		this.generation += 1;
		this.rejectQueued(reason);
		this.abortActive(reason);
	}

	runTurn<T>(
		sessionId: string,
		signal: AbortSignal | undefined,
		work: (lease: ProviderLease) => Promise<T>,
	): Promise<T> {
		if (sessionId.trim().length === 0)
			return Promise.reject(new Error("provider scheduler session id must not be empty"));
		return new Promise<T>((resolve, reject) => {
			if (this.closed !== undefined) {
				reject(this.closed);
				return;
			}
			const job: TurnJob<T> = { kind: "turn", sessionId, signal, work, resolve, reject };
			const abort = (): void => {
				const index = this.queue.indexOf(job as Job<unknown>);
				if (index < 0) return;
				this.queue.splice(index, 1);
				reject(
					signal?.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"),
				);
				this.notifyIdle();
				this.drive();
			};
			job.abort = abort;
			if (signal?.aborted) {
				reject(
					signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"),
				);
				return;
			}
			signal?.addEventListener("abort", abort, { once: true });
			this.queue.push(job as Job<unknown>);
			this.drive();
		});
	}

	runExclusive<T>(work: (lease: ProviderLease) => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (this.closed !== undefined) {
				reject(this.closed);
				return;
			}
			this.queue.push({ kind: "exclusive", work, resolve, reject } as Job<unknown>);
			this.drive();
		});
	}

	private drive(): void {
		if (this.exclusive) return;
		if (this.closed !== undefined) {
			this.notifyIdle();
			return;
		}
		for (;;) {
			const next = this.nextRunnable();
			if (next === undefined) {
				this.notifyIdle();
				return;
			}
			this.queue.splice(next.index, 1);
			this.start(next.job);
			if (next.job.kind === "exclusive") return;
		}
	}

	private nextRunnable(): { index: number; job: Job<unknown> } | undefined {
		if (this.active >= this.capacity) return undefined;
		const exclusiveFence = this.queue.findIndex((job) => job.kind === "exclusive");
		const limit = exclusiveFence < 0 ? this.queue.length : exclusiveFence;
		for (let index = 0; index < limit; index += 1) {
			const job = this.queue[index];
			if (job?.kind === "turn" && !this.activeSessions.has(job.sessionId)) return { index, job };
		}
		if (exclusiveFence === 0 && this.active === 0) {
			const job = this.queue[0];
			if (job !== undefined) return { index: 0, job };
		}
		return undefined;
	}

	private start(job: Job<unknown>): void {
		const controller = new AbortController();
		const active: ActiveJob = { controller };
		if (job.kind === "turn") {
			job.signal?.removeEventListener("abort", job.abort!);
			active.externalAbort = () => controller.abort(job.signal?.reason);
			job.signal?.addEventListener("abort", active.externalAbort, { once: true });
			this.activeSessions.add(job.sessionId);
		} else {
			this.exclusive = true;
		}
		const lease = { generation: this.generation, signal: controller.signal };
		this.active += 1;
		this.activeJobs.add(active);
		void job
			.work(lease)
			.then(job.resolve, job.reject)
			.finally(() => {
				this.active -= 1;
				this.activeJobs.delete(active);
				if (job.kind === "turn") {
					job.signal?.removeEventListener("abort", active.externalAbort!);
					this.activeSessions.delete(job.sessionId);
				} else this.exclusive = false;
				this.drive();
			});
	}

	private abortActive(reason: Error): void {
		for (const active of this.activeJobs) active.controller.abort(reason);
	}

	private rejectQueued(reason: Error): void {
		for (const job of this.queue.splice(0)) {
			if (job.kind === "turn") job.signal?.removeEventListener("abort", job.abort!);
			job.reject(reason);
		}
		this.notifyIdle();
	}

	private notifyIdle(): void {
		if (!this.isIdle) return;
		for (const resolve of this.idleWaiters) resolve();
		this.idleWaiters.clear();
	}
}
