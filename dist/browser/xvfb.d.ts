import { type BrowserVendorOptions } from "#internet/browser/vendor";
export interface XvfbCandidate {
    executable: string;
    env: NodeJS.ProcessEnv;
    source: "bundled" | "system";
}
export interface XvfbDiscoveryOptions extends BrowserVendorOptions {
}
/** Resolve bundled-first Xvfb candidates for this process and base environment. */
export declare function discoverXvfbCandidates(baseEnv: NodeJS.ProcessEnv, options?: XvfbDiscoveryOptions): XvfbCandidate[];
//# sourceMappingURL=xvfb.d.ts.map