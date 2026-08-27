import { accessSync, constants, existsSync } from "node:fs";
import { join } from "node:path";
import { bundledBrowserEnv, bundledBrowserRuntime } from "#internet/browser/vendor";
function executableExists(path) {
    if (!existsSync(path))
        return false;
    try {
        accessSync(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
/** Resolve bundled-first x11vnc candidates for a displayless login. */
export function discoverVncCandidates(baseEnv, options = {}) {
    const candidates = [];
    const root = bundledBrowserRuntime(options);
    if (root !== undefined) {
        const executable = join(root, "bin", "x11vnc");
        if (executableExists(executable)) {
            candidates.push({ executable, source: "bundled", env: bundledBrowserEnv(root, baseEnv) });
        }
    }
    candidates.push({ executable: "x11vnc", source: "system", env: { ...baseEnv } });
    return candidates;
}
/** Secure x11vnc arguments for one loopback-only managed display. */
export function vncArgs(display, port, passwordFile) {
    return [
        "-display",
        display,
        "-rfbport",
        String(port),
        "-passwdfile",
        `rm:${passwordFile}`,
        "-localhost",
        "-norc",
        "-forever",
        "-shared",
        "-noxdamage",
        "-noxfixes",
        "-noxrecord",
        "-quiet",
    ];
}
//# sourceMappingURL=vnc.js.map