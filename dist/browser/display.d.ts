import { type ChildProcess } from "node:child_process";
import { type XvfbCandidate } from "#internet/browser/xvfb";
export type BrowserDisplay = {
    kind: "headless";
} | {
    kind: "system";
    env: NodeJS.ProcessEnv;
} | {
    kind: "visible";
    env: NodeJS.ProcessEnv;
} | {
    kind: "virtual";
    env: NodeJS.ProcessEnv;
};
export type BrowserViewport = {
    width: number;
    height: number;
} | null;
/** Natural viewport is limited to plugin-owned Xvfb; existing modes stay stable. */
export declare function browserViewport(display: BrowserDisplay): BrowserViewport;
/** Browser window flags for automated headed launches. */
export declare function headedWindowArgs(display: BrowserDisplay): string[];
type SpawnXvfb = (command: string, args: readonly string[], options: {
    env: NodeJS.ProcessEnv;
    stdio: Array<"ignore" | "pipe">;
}) => ChildProcess;
export interface BrowserDisplayManagerOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    spawnXvfb?: SpawnXvfb;
    startupTimeoutMs?: number;
    shutdownTimeoutMs?: number;
    xvfbCandidates?: readonly XvfbCandidate[];
    onVirtualDisplayExit?: () => void;
}
/** Owns the optional Xvfb process used by headed automated Chrome launches. */
export declare class BrowserDisplayManager {
    private readonly platform;
    private readonly baseEnv;
    private readonly spawnXvfb;
    private readonly startupTimeoutMs;
    private readonly shutdownTimeoutMs;
    private readonly xvfbCandidates;
    private readonly onVirtualDisplayExit;
    private readonly children;
    private active;
    private startup;
    private startupFailure;
    private useSystemFallback;
    private disposed;
    constructor(options?: BrowserDisplayManagerOptions);
    /** Prepare the environment for one automated Chrome launch. */
    prepare(headless: boolean, visible?: boolean): Promise<BrowserDisplay>;
    /** Whether interactive Chrome can use a user-visible display. */
    hasInteractiveDisplay(): boolean;
    /** Interactive login must use a display the user can actually see. */
    requireInteractiveDisplay(): void;
    /** Stop every Xvfb process owned by this manager. */
    dispose(): Promise<void>;
    private assertActive;
    private hasSystemDisplay;
    private startVirtualDisplay;
    private startXvfbCandidate;
    private terminateChild;
    private waitForExit;
}
export {};
//# sourceMappingURL=display.d.ts.map