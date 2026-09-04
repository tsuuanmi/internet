import { join } from "node:path";
import { fileURLToPath } from "node:url";
const BUNDLED_TARGET = "linux-x64-gnu";
const MINIMUM_GLIBC = [2, 31];
function runtimeGlibcVersion() {
    const report = process.report?.getReport();
    const version = report?.header?.glibcVersionRuntime;
    return typeof version === "string" ? version : undefined;
}
/** Resolve the bundled browser runtime when this host is ABI-compatible. */
export function bundledBrowserRuntime(options = {}, minimumGlibc = MINIMUM_GLIBC) {
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    const glibcVersion = options.glibcVersion ?? runtimeGlibcVersion();
    if (platform !== "linux" || arch !== "x64" || glibcVersion === undefined)
        return undefined;
    const [major, minor] = glibcVersion.split(".").map(Number);
    if (!Number.isInteger(major) ||
        !Number.isInteger(minor) ||
        major < minimumGlibc[0] ||
        (major === minimumGlibc[0] && minor < minimumGlibc[1])) {
        return undefined;
    }
    return options.bundleRoot ?? fileURLToPath(new URL(`../../vendor/xvfb/${BUNDLED_TARGET}/`, import.meta.url));
}
/** Environment that loads executables and libraries from the bundled runtime. */
export function bundledBrowserEnv(root, baseEnv) {
    return {
        ...baseEnv,
        PATH: [join(root, "bin"), baseEnv.PATH].filter(Boolean).join(":"),
        LD_LIBRARY_PATH: [join(root, "lib"), baseEnv.LD_LIBRARY_PATH].filter(Boolean).join(":"),
        XKB_CONFIG_ROOT: join(root, "share", "X11", "xkb"),
    };
}
//# sourceMappingURL=vendor.js.map