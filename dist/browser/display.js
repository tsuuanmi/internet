import { spawn } from "node:child_process";
import { discoverXvfbCandidates } from "#internet/browser/xvfb";
import { InternetError } from "#internet/core/errors";
const XVFB_SCREEN = "1920x1080x24";
const STARTUP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const MAX_DIAGNOSTIC_CHARS = 4_096;
/** Natural viewport is limited to plugin-owned Xvfb; existing modes stay stable. */
export function browserViewport(display) {
    return display.kind === "virtual" ? null : { width: 1280, height: 900 };
}
/** Browser window flags for automated headed launches. */
export function headedWindowArgs(display) {
    return display.kind === "virtual"
        ? ["--window-size=1920,1080"]
        : ["--window-position=-10000,-10000", "--window-size=800,600"];
}
function unavailableMessage(diagnostic) {
    const suffix = diagnostic?.trim() ? ` Xvfb reported: ${diagnostic.trim()}` : "";
    return ("No managed graphical display is available. Install Xvfb " +
        "(Ubuntu/Debian: sudo apt install xvfb), provide a working DISPLAY, or explicitly set headless: true." +
        suffix);
}
function appendBounded(current, chunk) {
    return `${current}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_CHARS);
}
function childIsRunning(child) {
    return child.exitCode === null && child.signalCode === null;
}
/** Owns the optional Xvfb process used by headed automated Chrome launches. */
export class BrowserDisplayManager {
    constructor(options = {}) {
        this.children = new Set();
        this.useSystemFallback = false;
        this.disposed = false;
        this.platform = options.platform ?? process.platform;
        this.baseEnv = { ...(options.env ?? process.env) };
        this.spawnXvfb = options.spawnXvfb ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
        this.startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
        this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS;
        this.xvfbCandidates = options.xvfbCandidates ?? discoverXvfbCandidates(this.baseEnv, { platform: this.platform });
        this.onVirtualDisplayExit = options.onVirtualDisplayExit;
    }
    /** Prepare the environment for one automated Chrome launch. */
    async prepare(headless) {
        this.assertActive();
        if (headless)
            return { kind: "headless" };
        if (this.platform !== "linux" || this.useSystemFallback)
            return { kind: "system", env: { ...this.baseEnv } };
        if (this.active !== undefined)
            return this.active.display;
        if (this.startupFailure !== undefined)
            throw this.startupFailure;
        if (this.startup !== undefined)
            return this.startup;
        const startup = this.startVirtualDisplay();
        this.startup = startup;
        try {
            return await startup;
        }
        catch (error) {
            this.assertActive();
            if (this.hasSystemDisplay()) {
                this.useSystemFallback = true;
                return { kind: "system", env: { ...this.baseEnv } };
            }
            this.startupFailure =
                error instanceof InternetError
                    ? error
                    : new InternetError("browser_unavailable", unavailableMessage(error instanceof Error ? error.message : String(error)));
            throw this.startupFailure;
        }
        finally {
            if (this.startup === startup)
                this.startup = undefined;
        }
    }
    /** Interactive login must use a display the user can actually see. */
    requireInteractiveDisplay() {
        this.assertActive();
        if (this.platform === "linux" && !this.hasSystemDisplay()) {
            throw new InternetError("browser_unavailable", "Interactive login requires a visible DISPLAY. Use a desktop, SSH X11 forwarding, or VNC for the one-time login; managed Xvfb is only used for automated browser steps.");
        }
    }
    /** Stop every Xvfb process owned by this manager. */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.active = undefined;
        const results = await Promise.allSettled([...this.children].map((child) => this.terminateChild(child)));
        const failure = results.find((result) => result.status === "rejected");
        if (failure !== undefined)
            throw failure.reason;
    }
    assertActive() {
        if (this.disposed)
            throw new InternetError("browser_unavailable", "Browser display manager has been disposed.");
    }
    hasSystemDisplay() {
        return typeof this.baseEnv.DISPLAY === "string" && this.baseEnv.DISPLAY.length > 0;
    }
    async startVirtualDisplay() {
        const failures = [];
        for (const candidate of this.xvfbCandidates) {
            try {
                return await this.startXvfbCandidate(candidate);
            }
            catch (error) {
                if (this.disposed)
                    throw error;
                failures.push(`${candidate.source}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        throw new InternetError("browser_unavailable", unavailableMessage(failures.join("; ")));
    }
    startXvfbCandidate(candidate) {
        return new Promise((resolve, reject) => {
            let displayOutput = "";
            let diagnostic = "";
            let settled = false;
            let child;
            const rejectAfterCleanup = (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                const detail = diagnostic || (error instanceof Error ? error.message : String(error));
                void this.terminateChild(child).then(() => reject(new InternetError("browser_unavailable", unavailableMessage(detail))), (cleanupError) => {
                    const cleanupDetail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                    reject(new InternetError("browser_unavailable", unavailableMessage(`${detail}; ${cleanupDetail}`)));
                });
            };
            const ready = (displayNumber) => {
                if (settled)
                    return;
                if (!/^\d+$/.test(displayNumber)) {
                    rejectAfterCleanup(new Error(`invalid display number ${JSON.stringify(displayNumber)}`));
                    return;
                }
                settled = true;
                clearTimeout(timer);
                const display = { kind: "virtual", env: { ...candidate.env, DISPLAY: `:${displayNumber}` } };
                this.active = { child, display };
                resolve(display);
            };
            const timer = setTimeout(() => rejectAfterCleanup(new Error("startup timed out")), this.startupTimeoutMs);
            try {
                child = this.spawnXvfb(candidate.executable, ["-displayfd", "3", "-screen", "0", XVFB_SCREEN, "-nolisten", "tcp"], {
                    env: { ...candidate.env },
                    stdio: ["ignore", "ignore", "pipe", "pipe"],
                });
            }
            catch (error) {
                settled = true;
                clearTimeout(timer);
                reject(new InternetError("browser_unavailable", unavailableMessage(error instanceof Error ? error.message : String(error))));
                return;
            }
            this.children.add(child);
            const stderr = child.stdio[2];
            const displayFd = child.stdio[3];
            stderr?.on("data", (chunk) => {
                diagnostic = appendBounded(diagnostic, chunk);
            });
            if (displayFd === null) {
                rejectAfterCleanup(new Error("Xvfb did not expose displayfd 3"));
                return;
            }
            displayFd.on("data", (chunk) => {
                displayOutput = appendBounded(displayOutput, chunk);
                const newline = displayOutput.indexOf("\n");
                if (newline >= 0)
                    ready(displayOutput.slice(0, newline).trim());
            });
            child.once("error", rejectAfterCleanup);
            child.once("exit", (code, signal) => {
                this.children.delete(child);
                if (this.active?.child === child) {
                    this.active = undefined;
                    if (!this.disposed)
                        this.onVirtualDisplayExit?.();
                }
                rejectAfterCleanup(new Error(`Xvfb exited before ready (code ${String(code)}, signal ${String(signal)})`));
            });
        });
    }
    async terminateChild(child) {
        if (!childIsRunning(child))
            return;
        child.kill("SIGTERM");
        if (await this.waitForExit(child, this.shutdownTimeoutMs))
            return;
        child.kill("SIGKILL");
        if (await this.waitForExit(child, this.shutdownTimeoutMs))
            return;
        throw new InternetError("browser_unavailable", `Xvfb process ${String(child.pid ?? "unknown")} did not terminate.`);
    }
    waitForExit(child, timeoutMs) {
        if (!childIsRunning(child))
            return Promise.resolve(true);
        return new Promise((resolve) => {
            let settled = false;
            const onExit = () => finish(true);
            const finish = (exited) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                child.off("exit", onExit);
                resolve(exited);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            child.once("exit", onExit);
        });
    }
}
//# sourceMappingURL=display.js.map