import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	type BrowserDisplay,
	BrowserDisplayManager,
	browserViewport,
	headedWindowArgs,
} from "#internet/browser/display";
import { InternetError } from "#internet/core/errors";

interface FakeChild extends ChildProcess {
	readonly displayFd: PassThrough;
	readonly stderrFd: PassThrough;
	readonly signals: NodeJS.Signals[];
}

function fakeChild(exitOnKill = true): FakeChild {
	const emitter = new EventEmitter() as FakeChild;
	const displayFd = new PassThrough();
	const stderrFd = new PassThrough();
	const state = emitter as any;
	Object.assign(state, {
		displayFd,
		stderrFd,
		stdio: [null, null, stderrFd, displayFd],
		exitCode: null,
		signalCode: null,
		killed: false,
		connected: false,
		spawnargs: [],
		spawnfile: "Xvfb",
		pid: 123,
		signals: [] as NodeJS.Signals[],
		kill(signal: NodeJS.Signals = "SIGTERM") {
			state.signals.push(signal);
			state.killed = true;
			if (exitOnKill) {
				state.signalCode = signal;
				queueMicrotask(() => state.emit("exit", null, signal));
			}
			return true;
		},
	});
	return emitter;
}

function successfulSpawner(children: FakeChild[]) {
	return vi.fn((_command, _args, _options) => {
		const child = fakeChild();
		children.push(child);
		queueMicrotask(() => child.displayFd.write("42\n"));
		return child;
	});
}

describe("automated browser display policy", () => {
	it("uses natural viewport and a normal 1920x1080 window only for managed Xvfb", () => {
		const display: BrowserDisplay = { kind: "virtual", env: { DISPLAY: ":42" } };
		expect(browserViewport(display)).toBeNull();
		expect(headedWindowArgs(display)).toEqual(["--window-size=1920,1080"]);
	});

	it("preserves the existing deterministic viewport and hidden window on system display", () => {
		const display: BrowserDisplay = { kind: "system", env: { DISPLAY: ":1" } };
		expect(browserViewport(display)).toEqual({ width: 1280, height: 900 });
		expect(headedWindowArgs(display)).toEqual(["--window-position=-10000,-10000", "--window-size=800,600"]);
	});

	it("preserves the existing deterministic viewport for native headless Chrome", () => {
		expect(browserViewport({ kind: "headless" })).toEqual({ width: 1280, height: 900 });
	});
});

describe("BrowserDisplayManager", () => {
	it("does not inspect or spawn a display for native headless Chrome", async () => {
		const spawnXvfb = vi.fn();
		const manager = new BrowserDisplayManager({ platform: "linux", env: {}, spawnXvfb });
		await expect(manager.prepare(true)).resolves.toEqual({ kind: "headless" });
		expect(spawnXvfb).not.toHaveBeenCalled();
	});

	it("uses the system environment directly on non-Linux platforms", async () => {
		const spawnXvfb = vi.fn();
		const manager = new BrowserDisplayManager({ platform: "darwin", env: { MARKER: "yes" }, spawnXvfb });
		await expect(manager.prepare(false)).resolves.toEqual({ kind: "system", env: { MARKER: "yes" } });
		expect(spawnXvfb).not.toHaveBeenCalled();
	});

	it("prefers one shared Xvfb even when a system DISPLAY exists", async () => {
		const children: FakeChild[] = [];
		const spawnXvfb = successfulSpawner(children);
		const manager = new BrowserDisplayManager({
			platform: "linux",
			env: { DISPLAY: ":1", MARKER: "yes" },
			spawnXvfb,
		});
		const [first, second] = await Promise.all([manager.prepare(false), manager.prepare(false)]);
		expect(first).toEqual({ kind: "virtual", env: { DISPLAY: ":42", MARKER: "yes" } });
		expect(second).toEqual(first);
		expect(spawnXvfb).toHaveBeenCalledTimes(1);
		expect(spawnXvfb).toHaveBeenCalledWith(
			"Xvfb",
			["-displayfd", "3", "-screen", "0", "1920x1080x24", "-nolisten", "tcp"],
			expect.objectContaining({ stdio: ["ignore", "ignore", "pipe", "pipe"] }),
		);
		await manager.dispose();
		expect(children[0].signals).toEqual(["SIGTERM"]);
	});

	it("falls back to the existing system DISPLAY when Xvfb cannot start", async () => {
		const spawnXvfb = vi.fn(() => {
			throw Object.assign(new Error("spawn Xvfb ENOENT"), { code: "ENOENT" });
		});
		const manager = new BrowserDisplayManager({ platform: "linux", env: { DISPLAY: ":7" }, spawnXvfb });
		await expect(manager.prepare(false)).resolves.toEqual({ kind: "system", env: { DISPLAY: ":7" } });
		await manager.prepare(false);
		expect(spawnXvfb).toHaveBeenCalledTimes(1);
	});

	it("fails actionably without Xvfb or a system DISPLAY", async () => {
		const spawnXvfb = vi.fn(() => {
			throw new Error("spawn Xvfb ENOENT");
		});
		const manager = new BrowserDisplayManager({ platform: "linux", env: {}, spawnXvfb });
		const error = await manager.prepare(false).catch((reason: unknown) => reason);
		expect(error).toBeInstanceOf(InternetError);
		expect((error as InternetError).kind).toBe("browser_unavailable");
		expect((error as Error).message).toContain("sudo apt install xvfb");
		expect((error as Error).message).toContain("headless: true");
		await expect(manager.prepare(false)).rejects.toBe(error);
		expect(spawnXvfb).toHaveBeenCalledTimes(1);
	});

	it("falls back on malformed displayfd output and bounds diagnostics", async () => {
		const child = fakeChild();
		const manager = new BrowserDisplayManager({
			platform: "linux",
			env: { DISPLAY: ":8" },
			spawnXvfb: () => {
				queueMicrotask(() => {
					child.stderrFd.write("x".repeat(10_000));
					child.displayFd.write("not-a-display\n");
				});
				return child;
			},
		});
		await expect(manager.prepare(false)).resolves.toMatchObject({ kind: "system" });
	});

	it("times out startup and uses system fallback", async () => {
		vi.useFakeTimers();
		try {
			const child = fakeChild();
			const manager = new BrowserDisplayManager({
				platform: "linux",
				env: { DISPLAY: ":9" },
				spawnXvfb: () => child,
				startupTimeoutMs: 20,
			});
			const pending = manager.prepare(false);
			await vi.advanceTimersByTimeAsync(20);
			await expect(pending).resolves.toEqual({ kind: "system", env: { DISPLAY: ":9" } });
			expect(child.signals).toContain("SIGTERM");
		} finally {
			vi.useRealTimers();
		}
	});

	it("invalidates a virtual display after unexpected exit and starts another", async () => {
		const children: FakeChild[] = [];
		const onVirtualDisplayExit = vi.fn();
		const manager = new BrowserDisplayManager({
			platform: "linux",
			env: {},
			spawnXvfb: successfulSpawner(children),
			onVirtualDisplayExit,
		});
		await manager.prepare(false);
		Object.defineProperty(children[0], "exitCode", { configurable: true, value: 1 });
		children[0].emit("exit", 1, null);
		expect(onVirtualDisplayExit).toHaveBeenCalledOnce();
		await manager.prepare(false);
		expect(children).toHaveLength(2);
		await manager.dispose();
	});

	it("cancels an in-flight startup during disposal", async () => {
		const child = fakeChild();
		const manager = new BrowserDisplayManager({ platform: "linux", env: {}, spawnXvfb: () => child });
		const startup = manager.prepare(false);
		const rejected = expect(startup).rejects.toThrow(/disposed/);
		await manager.dispose();
		await rejected;
		expect(child.signals).toEqual(["SIGTERM"]);
	});

	it("requires a user-managed display for interactive login", async () => {
		const manager = new BrowserDisplayManager({ platform: "linux", env: {}, spawnXvfb: successfulSpawner([]) });
		await manager.prepare(false);
		expect(() => manager.requireInteractiveDisplay()).toThrow(/visible DISPLAY/);
		await manager.dispose();

		const visible = new BrowserDisplayManager({ platform: "linux", env: { DISPLAY: ":1" } });
		expect(() => visible.requireInteractiveDisplay()).not.toThrow();
	});

	it("escalates shutdown to SIGKILL and remains disposed", async () => {
		vi.useFakeTimers();
		try {
			const child = fakeChild(false);
			const manager = new BrowserDisplayManager({
				platform: "linux",
				env: {},
				spawnXvfb: () => {
					queueMicrotask(() => child.displayFd.write("5\n"));
					return child;
				},
				shutdownTimeoutMs: 10,
			});
			await manager.prepare(false);
			const disposing = manager.dispose();
			const rejected = expect(disposing).rejects.toThrow(/did not terminate/);
			await vi.advanceTimersByTimeAsync(20);
			await rejected;
			expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
			await manager.dispose();
			await expect(manager.prepare(false)).rejects.toThrow(/disposed/);
		} finally {
			vi.useRealTimers();
		}
	});
});
