import { type VncCandidate } from "#internet/browser/vnc";
import type { WebProvider } from "#internet/core/config";
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
/** One short-lived, loopback-only noVNC login desktop. */
export declare class RemoteLoginSession {
    private readonly options;
    private readonly token;
    private readonly password;
    private readonly display;
    private readonly sockets;
    private state;
    private message;
    private expiresAt;
    private tempDir;
    private vncPort;
    private httpPort;
    private vnc;
    private chrome;
    private server;
    private websocket;
    private timeout;
    private closeTimer;
    private desktopCleanup;
    private finalization;
    private disposal;
    private intentionalExit;
    private constructor();
    static start(options: RemoteLoginOptions): Promise<RemoteLoginSession>;
    status(): RemoteLoginStatus;
    requestSave(): Promise<void>;
    waitForFinalization(): Promise<void>;
    private finalizeAccount;
    cancel(message?: string): Promise<void>;
    dispose(): Promise<void>;
    private initialize;
    private startVnc;
    private startServer;
    private startChrome;
    private handleRequest;
    private authorized;
    private securityHeaders;
    private page;
    private bridgeVnc;
    private fail;
    private closeDesktop;
    private closeDesktopOnce;
    private terminate;
    private scheduleClose;
    private clearTimeout;
    private disposeOnce;
}
//# sourceMappingURL=remote-login.d.ts.map