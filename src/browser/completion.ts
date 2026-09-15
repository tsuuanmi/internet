import { InternetError } from "#internet/core/errors";
import { htmlToMarkdown } from "#internet/core/markdown";

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

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(
					signal.reason instanceof Error ? signal.reason : new InternetError("aborted", "browser turn aborted"),
				);
			},
			{ once: true },
		);
	});
}

function emitProgress(observer: WaitOptions["onProgress"], kind: ProviderProgressKind, at: number): void {
	if (observer === undefined) return;
	try {
		observer({ kind, at: new Date(at).toISOString() });
	} catch {
		// Progress projection must never change provider-turn correctness.
	}
}

/**
 * Wait for a stable completed response while distinguishing a hard deadline
 * from a semantic no-progress stall. Only response/running transitions renew
 * the progress lease; unrelated DOM churn and a static thinking control do not.
 */
export async function waitForStableCompletion(
	read: () => Promise<CompletionSnapshot>,
	options: WaitOptions,
): Promise<string> {
	if (options.stallTimeoutMs !== undefined && options.stallTimeoutMs >= options.timeoutMs) {
		throw new InternetError("config_error", "completion stallTimeoutMs must be lower than timeoutMs");
	}
	const startedAt = Date.now();
	const deadline = startedAt + options.timeoutMs;
	let lastMeaningfulProgressAt = startedAt;
	let previous: CompletionSnapshot | undefined;
	let candidate: { text: string; html: string } | undefined;
	let stableSince: number | undefined;

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
			if (snapshot.responsePresent) emitProgress(options.onProgress, "response_started", at);
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
					return candidate?.html ? htmlToMarkdown(snapshot.html) : text;
				}
			} else {
				stableSince = undefined;
			}
			candidate = { text, html: snapshot.html };
		} else {
			candidate = undefined;
			stableSince = undefined;
		}

		if (options.stallTimeoutMs !== undefined && at - lastMeaningfulProgressAt >= options.stallTimeoutMs) {
			throw new InternetError(
				"provider_stalled",
				`browser provider made no meaningful progress for ${options.stallTimeoutMs}ms`,
			);
		}
		await delay(options.pollMs, options.signal);
	}
	throw new InternetError("timeout", `browser provider did not complete within ${options.timeoutMs}ms`);
}
