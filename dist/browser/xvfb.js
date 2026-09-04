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
/** Resolve bundled-first Xvfb candidates for this process and base environment. */
export function discoverXvfbCandidates(baseEnv, options = {}) {
    const candidates = [];
    // Focal's Xvfb relies on the host XKB compiler path; retain the established Jammy floor for it.
    const root = bundledBrowserRuntime(options, [2, 35]);
    if (root !== undefined) {
        const executable = join(root, "bin", "Xvfb");
        if (executableExists(executable)) {
            candidates.push({ executable, source: "bundled", env: bundledBrowserEnv(root, baseEnv) });
        }
    }
    candidates.push({ executable: "Xvfb", source: "system", env: { ...baseEnv } });
    return candidates;
}
//# sourceMappingURL=xvfb.js.map