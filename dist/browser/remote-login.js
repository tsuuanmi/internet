import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { BrowserDisplayManager } from "#internet/browser/display";
import { discoverVncCandidates, vncArgs } from "#internet/browser/vnc";
import { InternetError } from "#internet/core/errors";
import { ensurePrivateDirectory } from "#internet/core/private-json";
const LOOPBACK = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const SETTLED_GRACE_MS = 15_000;
const MAX_DIAGNOSTIC_CHARS = 4_096;
function childRunning(child) {
    return child !== undefined && child.exitCode === null && child.signalCode === null;
}
function html(value) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function bounded(current, chunk) {
    return `${current}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_CHARS);
}
async function listen(server, port = 0) {
    await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(port, LOOPBACK, () => {
            server.off("error", onError);
            resolve();
        });
    });
    return server.address().port;
}
async function freeLoopbackPort() {
    const server = createServer();
    try {
        return await listen(server);
    }
    finally {
        await new Promise((resolve) => server.close(() => resolve()));
    }
}
async function waitForTcp(port, child, timeoutMs) {
    let spawnError;
    const onError = (error) => {
        spawnError = error;
    };
    child.on("error", onError);
    try {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (spawnError !== undefined)
                throw spawnError;
            if (!childRunning(child))
                throw new Error("x11vnc exited before accepting connections");
            const connected = await new Promise((resolve) => {
                const socket = connect({ host: LOOPBACK, port });
                socket.once("connect", () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.once("error", () => resolve(false));
            });
            if (connected)
                return;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("x11vnc startup timed out");
    }
    finally {
        child.off("error", onError);
    }
}
async function waitForExit(child, timeoutMs) {
    if (!childRunning(child))
        return true;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (exited) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            child.off("exit", onExit);
            resolve(exited);
        };
        const onExit = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        child.once("exit", onExit);
    });
}
/** One short-lived, loopback-only noVNC login desktop. */
export class RemoteLoginSession {
    constructor(options) {
        this.token = randomBytes(32).toString("base64url");
        this.password = randomBytes(6).toString("base64url");
        this.sockets = new Set();
        this.state = "waiting";
        this.message = "Starting remote login…";
        this.intentionalExit = false;
        this.options = options;
        this.expiresAt = new Date(Date.now() + options.timeoutMs).toISOString();
        const env = { ...(options.env ?? process.env) };
        delete env.DISPLAY;
        this.display = new BrowserDisplayManager({ platform: "linux", env });
    }
    static async start(options) {
        const session = new RemoteLoginSession(options);
        try {
            await session.initialize();
            return session;
        }
        catch (error) {
            await session.dispose();
            throw error;
        }
    }
    status() {
        return {
            state: this.state,
            message: this.message,
            ...(this.httpPort === undefined
                ? {}
                : {
                    url: `http://${LOOPBACK}:${this.httpPort}/${this.token}/`,
                    port: this.httpPort,
                    sshCommand: `ssh -N -L ${this.httpPort}:${LOOPBACK}:${this.httpPort} <user>@<server>`,
                }),
            ...(this.state === "waiting" ? { expiresAt: this.expiresAt } : {}),
        };
    }
    requestSave() {
        if (this.state === "waiting") {
            this.clearTimeout();
            this.state = "finalizing";
            this.message = "Closing Chrome and verifying the account…";
            this.finalization = this.finalizeAccount();
        }
        return this.finalization ?? Promise.resolve();
    }
    waitForFinalization() {
        return this.finalization ?? Promise.resolve();
    }
    async finalizeAccount() {
        const accountFinalization = this.options.finalize().then(() => ({ ok: true }), (error) => ({ ok: false, error }));
        try {
            await this.closeDesktop();
            const result = await accountFinalization;
            if (!result.ok)
                throw result.error;
            this.state = "complete";
            this.message = `${this.options.provider} account saved successfully.`;
        }
        catch (error) {
            await accountFinalization;
            this.state = "failed";
            this.message = error instanceof Error ? error.message : "Remote login finalization failed.";
        }
        finally {
            this.clearTimeout();
            this.scheduleClose();
        }
    }
    async cancel(message = "Remote login cancelled.") {
        if (this.state === "finalizing")
            return;
        if (this.state !== "complete") {
            this.state = "failed";
            this.message = message;
        }
        await this.dispose();
    }
    async dispose() {
        this.disposal ??= this.disposeOnce();
        return this.disposal;
    }
    async initialize() {
        ensurePrivateDirectory(join(this.options.dataDir, "remote-login"));
        this.tempDir = mkdtempSync(join(this.options.dataDir, "remote-login", `${this.options.provider}-`));
        chmodSync(this.tempDir, 0o700);
        const display = await this.display.prepare(false);
        if (display.kind !== "virtual")
            throw new Error("remote login requires a managed virtual display");
        await this.startVnc(display.env);
        await this.startServer();
        await this.startChrome(display.env);
        this.expiresAt = new Date(Date.now() + this.options.timeoutMs).toISOString();
        this.message = "Remote desktop ready. Sign in, then press Save account.";
        this.timeout = setTimeout(() => {
            void this.fail("Remote login timed out before the account was saved.");
        }, this.options.timeoutMs);
        this.timeout.unref();
    }
    async startVnc(displayEnv) {
        const display = displayEnv.DISPLAY;
        if (display === undefined)
            throw new Error("managed display did not provide DISPLAY");
        const baseEnv = { ...(this.options.env ?? process.env), ...displayEnv };
        const candidates = this.options.vncCandidates ?? discoverVncCandidates(baseEnv);
        const failures = [];
        for (const candidate of candidates) {
            const port = await freeLoopbackPort();
            const passwordFile = join(this.tempDir, "vnc-password");
            writeFileSync(passwordFile, `${this.password}\n`, { mode: 0o600 });
            let diagnostic = "";
            let child;
            try {
                child = spawn(candidate.executable, vncArgs(display, port, passwordFile), {
                    env: { ...candidate.env, ...displayEnv },
                    stdio: ["ignore", "ignore", "pipe"],
                });
                child.stderr?.on("data", (chunk) => {
                    diagnostic = bounded(diagnostic, chunk);
                });
                await waitForTcp(port, child, STARTUP_TIMEOUT_MS);
                this.vnc = child;
                this.vncPort = port;
                child.on("error", (error) => {
                    if (!this.intentionalExit && this.state === "waiting")
                        void this.fail(`Remote desktop failed: ${error.message}`);
                });
                child.once("exit", (code, signal) => {
                    if (!this.intentionalExit && this.state === "waiting") {
                        void this.fail(`Remote desktop exited (code ${String(code)}, signal ${String(signal)}).`);
                    }
                });
                return;
            }
            catch (error) {
                await this.terminate(child);
                failures.push(`${candidate.source}: ${diagnostic.trim() || (error instanceof Error ? error.message : String(error))}`);
                rmSync(passwordFile, { force: true });
            }
        }
        throw new InternetError("browser_unavailable", `Could not start loopback x11vnc. ${failures.join("; ")}`);
    }
    async startServer() {
        const clientScript = this.options.clientScript ?? readFileSync(new URL("../remote-login-client.js", import.meta.url), "utf8");
        const websocket = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1_048_576 });
        const server = createServer((request, response) => this.handleRequest(request, response, clientScript));
        server.on("upgrade", (request, socket, head) => {
            if (!this.authorized(request, true) || request.url !== `/${this.token}/vnc`) {
                socket.destroy();
                return;
            }
            websocket.handleUpgrade(request, socket, head, (client) => this.bridgeVnc(client));
        });
        this.server = server;
        this.websocket = websocket;
        this.httpPort = await listen(server);
    }
    async startChrome(env) {
        const child = spawn(this.options.chromePath, [
            `--user-data-dir=${this.options.profileDir}`,
            "--new-window",
            "--disable-background-mode",
            "--no-first-run",
            "--no-default-browser-check",
            this.options.homeUrl,
        ], { env, stdio: "ignore" });
        this.chrome = child;
        await new Promise((resolve, reject) => {
            const onError = (error) => reject(error);
            child.once("error", onError);
            child.once("spawn", () => {
                child.off("error", onError);
                resolve();
            });
        });
        child.on("error", (error) => {
            if (!this.intentionalExit && this.state === "waiting")
                void this.fail(`Login Chrome failed: ${error.message}`);
        });
        child.once("exit", (code, signal) => {
            if (this.intentionalExit || this.state !== "waiting")
                return;
            if (code === 0 && signal === null) {
                this.message = "Chrome is closed. Press Save account to verify the signed-in profile.";
            }
            else {
                void this.fail(`Login Chrome exited unexpectedly (code ${String(code)}, signal ${String(signal)}).`);
            }
        });
    }
    handleRequest(request, response, clientScript) {
        this.securityHeaders(response);
        if (!this.authorized(request)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        const base = `/${this.token}`;
        const isPost = request.method === "POST";
        if (isPost &&
            (!this.authorized(request, true) ||
                request.headers["transfer-encoding"] !== undefined ||
                Number(request.headers["content-length"] ?? 0) > 0)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        if (request.method === "GET" && (request.url === base || request.url === `${base}/`)) {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(this.page());
            return;
        }
        if (request.method === "GET" && request.url === `${base}/client.js`) {
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.end(clientScript);
            return;
        }
        if (request.method === "GET" && request.url === `${base}/status`) {
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(this.status()));
            return;
        }
        if (request.method === "POST" && request.url === `${base}/save`) {
            response
                .writeHead(this.state === "waiting" ? 202 : 409)
                .end(this.state === "waiting" ? "Accepted" : "Not waiting");
            if (this.state === "waiting")
                void this.requestSave();
            return;
        }
        if (request.method === "POST" && request.url === `${base}/cancel`) {
            response
                .writeHead(this.state === "waiting" ? 202 : 409)
                .end(this.state === "waiting" ? "Accepted" : "Not waiting");
            if (this.state === "waiting")
                void this.cancel();
            return;
        }
        response.writeHead(404).end("Not found");
    }
    authorized(request, requireOrigin = false) {
        if (Object.keys(request.headers).some((name) => name.startsWith("x-forwarded-")))
            return false;
        const host = request.headers.host;
        if (host === undefined || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host))
            return false;
        const origin = request.headers.origin;
        return origin === `http://${host}` || (!requireOrigin && origin === undefined);
    }
    securityHeaders(response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
    }
    page() {
        return `<!doctype html><html data-token="${html(this.token)}" data-password="${html(this.password)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remote browser login</title><style>html,body{height:100%;margin:0;background:#111;color:#eee;font:14px system-ui}body{display:grid;grid-template-rows:auto 1fr}header{display:flex;gap:12px;align-items:center;padding:10px;background:#202124}#status{flex:1}button{padding:8px 14px}#screen{overflow:hidden}</style></head><body><header><span id="status">Connecting…</span><button id="save">Save account</button><button id="cancel">Cancel</button></header><main id="screen"></main><script type="module" src="/${html(this.token)}/client.js"></script></body></html>`;
    }
    bridgeVnc(client) {
        if (this.vncPort === undefined) {
            client.close(1011, "VNC unavailable");
            return;
        }
        this.sockets.add(client);
        const upstream = connect({ host: LOOPBACK, port: this.vncPort });
        upstream.on("data", (chunk) => {
            if (client.readyState !== WebSocket.OPEN)
                return;
            upstream.pause();
            client.send(chunk, { binary: true }, () => upstream.resume());
        });
        upstream.once("error", () => client.close(1011, "VNC unavailable"));
        upstream.once("close", () => client.close());
        client.on("error", () => upstream.destroy());
        client.on("message", (data) => {
            const payload = Array.isArray(data)
                ? Buffer.concat(data)
                : data instanceof ArrayBuffer
                    ? Buffer.from(data)
                    : data;
            if (!upstream.write(payload)) {
                client.pause();
                upstream.once("drain", () => client.resume());
            }
        });
        client.once("close", () => {
            this.sockets.delete(client);
            upstream.destroy();
        });
    }
    async fail(message) {
        if (this.state === "complete" || this.state === "failed")
            return;
        this.state = "failed";
        this.message = message;
        this.clearTimeout();
        await this.closeDesktop();
        this.scheduleClose();
    }
    async closeDesktop() {
        this.desktopCleanup ??= this.closeDesktopOnce();
        return this.desktopCleanup;
    }
    async closeDesktopOnce() {
        this.intentionalExit = true;
        await this.terminate(this.chrome);
        await this.terminate(this.vnc);
        this.chrome = undefined;
        this.vnc = undefined;
        await this.display.dispose().catch(() => { });
        if (this.tempDir !== undefined)
            rmSync(this.tempDir, { recursive: true, force: true });
        this.tempDir = undefined;
    }
    async terminate(child) {
        if (!childRunning(child))
            return;
        child.kill("SIGTERM");
        if (await waitForExit(child, SHUTDOWN_TIMEOUT_MS))
            return;
        child.kill("SIGKILL");
        await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
    }
    scheduleClose() {
        if (this.closeTimer !== undefined)
            return;
        this.closeTimer = setTimeout(() => void this.dispose(), SETTLED_GRACE_MS);
        this.closeTimer.unref();
    }
    clearTimeout() {
        if (this.timeout !== undefined)
            clearTimeout(this.timeout);
        this.timeout = undefined;
    }
    async disposeOnce() {
        this.clearTimeout();
        if (this.closeTimer !== undefined)
            clearTimeout(this.closeTimer);
        this.closeTimer = undefined;
        await this.closeDesktop();
        for (const socket of this.sockets)
            socket.terminate();
        this.sockets.clear();
        this.websocket?.close();
        if (this.server?.listening)
            await new Promise((resolve) => this.server?.close(() => resolve()));
        this.server = undefined;
        this.websocket = undefined;
        this.options.onClosed?.();
    }
}
//# sourceMappingURL=remote-login.js.map