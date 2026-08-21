/** Resolve after `ms` milliseconds, rejecting early when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
			},
			{ once: true },
		);
	});
}
