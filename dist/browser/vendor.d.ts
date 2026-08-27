export interface BrowserVendorOptions {
    platform?: NodeJS.Platform;
    arch?: NodeJS.Architecture;
    glibcVersion?: string;
    bundleRoot?: string;
}
/** Resolve the bundled browser runtime when this host is ABI-compatible. */
export declare function bundledBrowserRuntime(options?: BrowserVendorOptions): string | undefined;
/** Environment that loads executables and libraries from the bundled runtime. */
export declare function bundledBrowserEnv(root: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
//# sourceMappingURL=vendor.d.ts.map