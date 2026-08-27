import { type BrowserVendorOptions } from "#internet/browser/vendor";
export interface VncCandidate {
    executable: string;
    env: NodeJS.ProcessEnv;
    source: "bundled" | "system";
}
export interface VncDiscoveryOptions extends BrowserVendorOptions {
}
/** Resolve bundled-first x11vnc candidates for a displayless login. */
export declare function discoverVncCandidates(baseEnv: NodeJS.ProcessEnv, options?: VncDiscoveryOptions): VncCandidate[];
/** Secure x11vnc arguments for one loopback-only managed display. */
export declare function vncArgs(display: string, port: number, passwordFile: string): string[];
//# sourceMappingURL=vnc.d.ts.map