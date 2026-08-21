import { InternetError } from "#internet/core/errors";
import { htmlToMarkdown } from "#internet/core/markdown";

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

/**
 * Poll the provider response surface until it is present and its text stays
 * unchanged for `stableMs` while generation is not running, or until the
 * deadline. Returns the stable rendered text as canonical markdown. This
 * mirrors the completion policy of pi-internet's Gemini driver and is
 * intentionally conservative: an unchanged-but-still-running response is never
 * treated as complete.
 */
export async function waitForStableCompletion(
	read: () => Promise<CompletionSnapshot>,
	options: WaitOptions,
): Promise<string> {
	const deadline = Date.now() + options.timeoutMs;
	let candidate: { text: string; html: string } | undefined;
	let stableSince: number | undefined;

	while (Date.now() < deadline) {
		if (options.signal?.aborted) {
			throw options.signal.reason instanceof Error
				? options.signal.reason
				: new InternetError("aborted", "browser turn aborted");
		}
		const snapshot = await read();
		const text = snapshot.text.trim();
		if (snapshot.responsePresent && text.length > 0) {
			const unchanged = candidate !== undefined && candidate.text === text;
			if (!snapshot.running && unchanged) {
				stableSince ??= Date.now();
				if (Date.now() - stableSince >= options.stableMs) {
					const markdown = candidate?.html ? htmlToMarkdown(snapshot.html) : text;
					return markdown;
				}
			} else {
				stableSince = undefined;
			}
			candidate = { text, html: snapshot.html };
		} else {
			candidate = undefined;
			stableSince = undefined;
		}
		await delay(options.pollMs, options.signal);
	}
	throw new InternetError("timeout", `browser provider did not complete within ${options.timeoutMs}ms`);
}
