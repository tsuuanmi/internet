import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import { join } from "node:path";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { BrowserDisplayManager } from "#internet/browser/display";
import { discoverVncCandidates, type VncCandidate, vncArgs } from "#internet/browser/vnc";
import type { WebProvider } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";
import { ensurePrivateDirectory } from "#internet/core/private-json";

const LOOPBACK = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const SETTLED_GRACE_MS = 15_000;
const MAX_DIAGNOSTIC_CHARS = 4_096;

export type RemoteLoginState = "waiting" | "finalizing" | "complete" | "failed";

export interface RemoteLoginStatus {
	state: RemoteLoginState;
	message: string;
	url?: string;
	port?: number;
	sshCommand?: string;
	expiresAt?: string;
}

export interface RemoteLoginOptions {
	provider: WebProvider;
	dataDir: string;
	chromePath: string;
	profileDir: string;
	homeUrl: string;
	timeoutMs: number;
	finalize: () => Promise<void>;
	onClosed?: () => void;
	env?: NodeJS.ProcessEnv;
	clientScript?: string;
	vncCandidates?: readonly VncCandidate[];
}

function childRunning(child: ChildProcess | undefined): child is ChildProcess {
	return child !== undefined && child.exitCode === null && child.signalCode === null;
}

function html(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function bounded(current: string, chunk: unknown): string {
	return `${current}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_CHARS);
}

async function listen(server: Server, port = 0): Promise<number> {
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error): void => reject(error);
		server.once("error", onError);
		server.listen(port, LOOPBACK, () => {
			server.off("error", onError);
			resolve();
		});
	});
	return (server.address() as AddressInfo).port;
}

async function freeLoopbackPort(): Promise<number> {
	const server = createServer();
	try {
		return await listen(server);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

async function waitForTcp(port: number, child: ChildProcess, timeoutMs: number): Promise<void> {
	let spawnError: Error | undefined;
	const onError = (error: Error): void => {
		spawnError = error;
	};
	child.on("error", onError);
	try {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (spawnError !== undefined) throw spawnError;
			if (!childRunning(child)) throw new Error("x11vnc exited before accepting connections");
			const connected = await new Promise<boolean>((resolve) => {
				const socket = connect({ host: LOOPBACK, port });
				socket.once("connect", () => {
					socket.destroy();
					resolve(true);
				});
				socket.once("error", () => resolve(false));
			});
			if (connected) return;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error("x11vnc startup timed out");
	} finally {
		child.off("error", onError);
	}
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (!childRunning(child)) return true;
	return new Promise((resolve) => {
		let settled = false;
		const finish = (exited: boolean): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.off("exit", onExit);
			resolve(exited);
		};
		const onExit = (): void => finish(true);
		const timer = setTimeout(() => finish(false), timeoutMs);
		child.once("exit", onExit);
	});
}

/** One short-lived, loopback-only noVNC login desktop. */
export class RemoteLoginSession {
	private readonly options: RemoteLoginOptions;
	private readonly token = randomBytes(32).toString("base64url");
	private readonly password = randomBytes(6).toString("base64url");
	private readonly display: BrowserDisplayManager;
	private readonly sockets = new Set<WebSocket>();
	private state: RemoteLoginState = "waiting";
	private message = "Starting remote login…";
	private expiresAt: string;
	private tempDir: string | undefined;
	private vncPort: number | undefined;
	private httpPort: number | undefined;
	private vnc: ChildProcess | undefined;
	private chrome: ChildProcess | undefined;
	private server: Server | undefined;
	private websocket: WebSocketServer | undefined;
	private timeout: NodeJS.Timeout | undefined;
	private closeTimer: NodeJS.Timeout | undefined;
	private desktopCleanup: Promise<void> | undefined;
	private finalization: Promise<void> | undefined;
	private disposal: Promise<void> | undefined;
	private intentionalExit = false;

	private constructor(options: RemoteLoginOptions) {
		this.options = options;
		this.expiresAt = new Date(Date.now() + options.timeoutMs).toISOString();
		const env = { ...(options.env ?? process.env) };
		delete env.DISPLAY;
		this.display = new BrowserDisplayManager({ platform: "linux", env });
	}

	static async start(options: RemoteLoginOptions): Promise<RemoteLoginSession> {
		const session = new RemoteLoginSession(options);
		try {
			await session.initialize();
			return session;
		} catch (error) {
			await session.dispose();
			throw error;
		}
	}

	status(): RemoteLoginStatus {
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

	requestSave(): Promise<void> {
		if (this.state === "waiting") {
			this.clearTimeout();
			this.state = "finalizing";
			this.message = "Closing Chrome and verifying the account…";
			this.finalization = this.finalizeAccount();
		}
		return this.finalization ?? Promise.resolve();
	}

	waitForFinalization(): Promise<void> {
		return this.finalization ?? Promise.resolve();
	}

	private async finalizeAccount(): Promise<void> {
		const accountFinalization = this.options.finalize();
		try {
			await this.closeDesktop();
			await accountFinalization;
			this.state = "complete";
			this.message = `${this.options.provider} account saved successfully.`;
		} catch (error) {
			await accountFinalization.catch(() => {});
			this.state = "failed";
			this.message = error instanceof Error ? error.message : "Remote login finalization failed.";
		} finally {
			this.clearTimeout();
			this.scheduleClose();
		}
	}

	async cancel(message = "Remote login cancelled."): Promise<void> {
		if (this.state === "finalizing") return;
		if (this.state !== "complete") {
			this.state = "failed";
			this.message = message;
		}
		await this.dispose();
	}

	async dispose(): Promise<void> {
		this.disposal ??= this.disposeOnce();
		return this.disposal;
	}

	private async initialize(): Promise<void> {
		ensurePrivateDirectory(join(this.options.dataDir, "remote-login"));
		this.tempDir = mkdtempSync(join(this.options.dataDir, "remote-login", `${this.options.provider}-`));
		chmodSync(this.tempDir, 0o700);
		const display = await this.display.prepare(false);
		if (display.kind !== "virtual") throw new Error("remote login requires a managed virtual display");
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

	private async startVnc(displayEnv: NodeJS.ProcessEnv): Promise<void> {
		const display = displayEnv.DISPLAY;
		if (display === undefined) throw new Error("managed display did not provide DISPLAY");
		const baseEnv = { ...(this.options.env ?? process.env), ...displayEnv };
		const candidates = this.options.vncCandidates ?? discoverVncCandidates(baseEnv);
		const failures: string[] = [];
		for (const candidate of candidates) {
			const port = await freeLoopbackPort();
			const passwordFile = join(this.tempDir!, "vnc-password");
			writeFileSync(passwordFile, `${this.password}\n`, { mode: 0o600 });
			let diagnostic = "";
			let child: ChildProcess | undefined;
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
			} catch (error) {
				await this.terminate(child);
				failures.push(
					`${candidate.source}: ${diagnostic.trim() || (error instanceof Error ? error.message : String(error))}`,
				);
				rmSync(passwordFile, { force: true });
			}
		}
		throw new InternetError("browser_unavailable", `Could not start loopback x11vnc. ${failures.join("; ")}`);
	}

	private async startServer(): Promise<void> {
		const clientScript =
			this.options.clientScript ?? readFileSync(new URL("../remote-login-client.js", import.meta.url), "utf8");
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

	private async startChrome(env: NodeJS.ProcessEnv): Promise<void> {
		const child = spawn(
			this.options.chromePath,
			[
				`--user-data-dir=${this.options.profileDir}`,
				"--new-window",
				"--disable-background-mode",
				"--no-first-run",
				"--no-default-browser-check",
				this.options.homeUrl,
			],
			{ env, stdio: "ignore" },
		);
		this.chrome = child;
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error): void => reject(error);
			child.once("error", onError);
			child.once("spawn", () => {
				child.off("error", onError);
				resolve();
			});
		});
		child.on("error", (error) => {
			if (!this.intentionalExit && this.state === "waiting") void this.fail(`Login Chrome failed: ${error.message}`);
		});
		child.once("exit", (code, signal) => {
			if (this.intentionalExit || this.state !== "waiting") return;
			if (code === 0 && signal === null) {
				this.message = "Chrome is closed. Press Save account to verify the signed-in profile.";
			} else {
				void this.fail(`Login Chrome exited unexpectedly (code ${String(code)}, signal ${String(signal)}).`);
			}
		});
	}

	private handleRequest(request: IncomingMessage, response: ServerResponse, clientScript: string): void {
		this.securityHeaders(response);
		if (!this.authorized(request)) {
			response.writeHead(403).end("Forbidden");
			return;
		}
		const base = `/${this.token}`;
		const isPost = request.method === "POST";
		if (
			isPost &&
			(!this.authorized(request, true) ||
				request.headers["transfer-encoding"] !== undefined ||
				Number(request.headers["content-length"] ?? 0) > 0)
		) {
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
			if (this.state === "waiting") void this.requestSave();
			return;
		}
		if (request.method === "POST" && request.url === `${base}/cancel`) {
			response
				.writeHead(this.state === "waiting" ? 202 : 409)
				.end(this.state === "waiting" ? "Accepted" : "Not waiting");
			if (this.state === "waiting") void this.cancel();
			return;
		}
		response.writeHead(404).end("Not found");
	}

	private authorized(request: IncomingMessage, requireOrigin = false): boolean {
		if (Object.keys(request.headers).some((name) => name.startsWith("x-forwarded-"))) return false;
		const host = request.headers.host;
		if (host === undefined || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) return false;
		const origin = request.headers.origin;
		return origin === `http://${host}` || (!requireOrigin && origin === undefined);
	}

	private securityHeaders(response: ServerResponse): void {
		response.setHeader("Cache-Control", "no-store");
		response.setHeader("Referrer-Policy", "no-referrer");
		response.setHeader("X-Content-Type-Options", "nosniff");
		response.setHeader(
			"Content-Security-Policy",
			"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
		);
	}

	private page(): string {
		return `<!doctype html><html data-token="${html(this.token)}" data-password="${html(this.password)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remote browser login</title><style>html,body{height:100%;margin:0;background:#111;color:#eee;font:14px system-ui}body{display:grid;grid-template-rows:auto 1fr}header{display:flex;gap:12px;align-items:center;padding:10px;background:#202124}#status{flex:1}button{padding:8px 14px}#screen{overflow:hidden}</style></head><body><header><span id="status">Connecting…</span><button id="save">Save account</button><button id="cancel">Cancel</button></header><main id="screen"></main><script type="module" src="/${html(this.token)}/client.js"></script></body></html>`;
	}

	private bridgeVnc(client: WebSocket): void {
		if (this.vncPort === undefined) {
			client.close(1011, "VNC unavailable");
			return;
		}
		this.sockets.add(client);
		const upstream = connect({ host: LOOPBACK, port: this.vncPort });
		upstream.on("data", (chunk) => {
			if (client.readyState !== WebSocket.OPEN) return;
			upstream.pause();
			client.send(chunk, { binary: true }, () => upstream.resume());
		});
		upstream.once("error", () => client.close(1011, "VNC unavailable"));
		upstream.once("close", () => client.close());
		client.on("error", () => upstream.destroy());
		client.on("message", (data: RawData) => {
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

	private async fail(message: string): Promise<void> {
		if (this.state === "complete" || this.state === "failed") return;
		this.state = "failed";
		this.message = message;
		this.clearTimeout();
		await this.closeDesktop();
		this.scheduleClose();
	}

	private async closeDesktop(): Promise<void> {
		this.desktopCleanup ??= this.closeDesktopOnce();
		return this.desktopCleanup;
	}

	private async closeDesktopOnce(): Promise<void> {
		this.intentionalExit = true;
		await this.terminate(this.chrome);
		await this.terminate(this.vnc);
		this.chrome = undefined;
		this.vnc = undefined;
		await this.display.dispose().catch(() => {});
		if (this.tempDir !== undefined) rmSync(this.tempDir, { recursive: true, force: true });
		this.tempDir = undefined;
	}

	private async terminate(child: ChildProcess | undefined): Promise<void> {
		if (!childRunning(child)) return;
		child.kill("SIGTERM");
		if (await waitForExit(child, SHUTDOWN_TIMEOUT_MS)) return;
		child.kill("SIGKILL");
		await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
	}

	private scheduleClose(): void {
		if (this.closeTimer !== undefined) return;
		this.closeTimer = setTimeout(() => void this.dispose(), SETTLED_GRACE_MS);
		this.closeTimer.unref();
	}

	private clearTimeout(): void {
		if (this.timeout !== undefined) clearTimeout(this.timeout);
		this.timeout = undefined;
	}

	private async disposeOnce(): Promise<void> {
		this.clearTimeout();
		if (this.closeTimer !== undefined) clearTimeout(this.closeTimer);
		this.closeTimer = undefined;
		await this.closeDesktop();
		for (const socket of this.sockets) socket.terminate();
		this.sockets.clear();
		this.websocket?.close();
		if (this.server?.listening) await new Promise<void>((resolve) => this.server?.close(() => resolve()));
		this.server = undefined;
		this.websocket = undefined;
		this.options.onClosed?.();
	}
}
